"""
Tests for subscription API endpoints - /api/subscription/*
"""

import pytest
from httpx import AsyncClient
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import User, Subscription, Payment as MPayment


class TestGetSubscription:
    """Tests for GET /api/subscription/"""

    @pytest.mark.asyncio
    async def test_get_subscription_no_sub(
        self, client: AsyncClient, auth_headers, db: AsyncSession, test_user: User
    ):
        """Should return inactive when no subscription."""
        response = await client.get("/api/subscription", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["active"] is False
        assert data["platform"] is None
        assert data["expiresAt"] is None

    @pytest.mark.asyncio
    async def test_get_subscription_with_active(
        self, client: AsyncClient, auth_headers, db: AsyncSession, test_user: User
    ):
        """Should return active subscription details."""
        subscription = Subscription(
            user_id=test_user.id,
            purchase_token="test_token",
            product_id="premium_monthly",
            active=True,
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        )
        db.add(subscription)
        await db.commit()

        response = await client.get("/api/subscription", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["active"] is True
        assert data["platform"] == "google"
        assert data["expiresAt"] is not None

    @pytest.mark.asyncio
    async def test_get_subscription_unauthenticated(self, client: AsyncClient):
        """Should return 401 when not authenticated."""
        response = await client.get("/api/subscription")
        assert response.status_code == 401


class TestIsPremium:
    """Tests for GET /api/subscription/is_premium"""

    @pytest.mark.asyncio
    async def test_is_premium_not_premium(self, client: AsyncClient, auth_headers, test_user: User):
        """Should return premium=False when user is not premium."""
        response = await client.get("/api/subscription/is_premium", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["premium"] is False

    @pytest.mark.asyncio
    async def test_is_premium_active(
        self, client: AsyncClient, auth_headers, db: AsyncSession, test_user: User
    ):
        """Should return premium=True when subscription is active."""
        test_user.premium = True
        test_user.subscription_expires = datetime.now(timezone.utc) + timedelta(days=30)
        await db.commit()

        response = await client.get("/api/subscription/is_premium", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["premium"] is True

    @pytest.mark.asyncio
    async def test_is_premium_expired(
        self, client: AsyncClient, auth_headers, db: AsyncSession, test_user: User
    ):
        """Should return premium=False and update DB when subscription expired."""
        test_user.premium = True
        test_user.subscription_expires = datetime.now(timezone.utc) - timedelta(days=1)
        await db.commit()

        response = await client.get("/api/subscription/is_premium", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["premium"] is False

        # Verify DB was updated
        result = await db.execute(select(User.premium).where(User.id == test_user.id))
        assert result.scalar_one() is False

    @pytest.mark.asyncio
    async def test_is_premium_unauthenticated(self, client: AsyncClient):
        """Should return 401 when not authenticated."""
        response = await client.get("/api/subscription/is_premium")
        assert response.status_code == 401


class TestCreatePayment:
    """Tests for POST /api/subscription/payment"""

    @pytest.mark.asyncio
    async def test_create_payment(
        self,
        client: AsyncClient,
        auth_headers,
        db: AsyncSession,
        test_user: User,
        monkeypatch,
    ):
        """Should create payment and return confirmation URL."""

        class FakePayment:
            id = "payment_id"

            class confirmation:
                confirmation_url = "https://fake"

        monkeypatch.setattr(
            "src.routers.subscription.Payment.create",
            lambda *args, **kwargs: FakePayment(),
        )
        response = await client.post("/api/subscription/payment", json={}, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "confirmationUrl" in data
        assert "https://" in data["confirmationUrl"]

        # Verify payment was saved to DB
        result = await db.execute(select(MPayment).where(MPayment.user_id == test_user.id))
        payment = result.scalar_one_or_none()
        assert payment is not None
        assert payment.status == "in_progress"

    @pytest.mark.asyncio
    async def test_create_payment_unauthenticated(self, client: AsyncClient):
        """Should return 401 when not authenticated."""
        response = await client.post("/api/subscription/payment")
        assert response.status_code == 401


class TestYookassaWebhook:
    """The webhook remains disabled until YooKassa authenticity is implemented."""

    @pytest.mark.asyncio
    async def test_webhook_fails_closed_without_mutating_payment(
        self, client: AsyncClient, db: AsyncSession, test_user: User
    ):
        mpayment = MPayment(
            id="payment_123",
            user_id=test_user.id,
            created_at=datetime.now(timezone.utc),
            status="in_progress",
        )
        db.add(mpayment)
        await db.commit()

        payload = {
            "event": "payment.succeeded",
            "object": {
                "id": "payment_123",
                "metadata": {"user_id": test_user.id},
            },
        }
        response = await client.post(
            "/api/subscription/yookassa/webhook",
            json=payload,
        )
        assert response.status_code == 404

        await db.refresh(mpayment)
        assert mpayment.status == "in_progress"
        await db.refresh(test_user)
        assert test_user.premium is False

    @pytest.mark.asyncio
    async def test_webhook_rejects_malformed_payload(self, client: AsyncClient):
        response = await client.post(
            "/api/subscription/yookassa/webhook",
            content=b"not-json",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 404


class TestCreatePaymentLimit:
    """Tests for pending payment limit (max 3)"""

    @pytest.mark.asyncio
    async def test_create_payment_429_when_three_pending(
        self, client: AsyncClient, auth_headers, db: AsyncSession, test_user: User, monkeypatch
    ):
        """Should return 429 when 3 pending payments already exist."""
        for i in range(3):
            mpayment = MPayment(
                id=f"payment_{i}",
                user_id=test_user.id,
                created_at=datetime.now(timezone.utc),
                status="in_progress",
            )
            db.add(mpayment)
        await db.commit()

        class FakePayment:
            id = "payment_id"

            class confirmation:
                confirmation_url = "https://fake"

        monkeypatch.setattr(
            "src.routers.subscription.Payment.create", lambda *args, **kwargs: FakePayment()
        )
        response = await client.post("/api/subscription/payment", json={}, headers=auth_headers)
        assert response.status_code == 429
        assert "Too many pending payments" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_create_payment_200_with_one_pending(
        self, client: AsyncClient, auth_headers, db: AsyncSession, test_user: User, monkeypatch
    ):
        """Should allow payment creation when only 1 pending payment exists."""
        mpayment = MPayment(
            id="payment_one",
            user_id=test_user.id,
            created_at=datetime.now(timezone.utc),
            status="in_progress",
        )
        db.add(mpayment)
        await db.commit()

        class FakePayment:
            id = "payment_id"

            class confirmation:
                confirmation_url = "https://fake"

        monkeypatch.setattr(
            "src.routers.subscription.Payment.create", lambda *args, **kwargs: FakePayment()
        )
        response = await client.post("/api/subscription/payment", json={}, headers=auth_headers)
        assert response.status_code == 200

        result = await db.execute(select(MPayment).where(MPayment.user_id == test_user.id))
        payments = result.scalars().all()
        assert len(payments) == 2
