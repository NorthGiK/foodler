"""Tests for subscription API endpoints."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import Payment as MPayment
from src.models import Subscription, User


def _remote_payment(
    payment_id: str,
    user_id: str,
    *,
    payment_status: str = "succeeded",
    paid: bool = True,
):
    return SimpleNamespace(
        id=payment_id,
        status=payment_status,
        paid=paid,
        amount=SimpleNamespace(value="5.00", currency="RUB"),
        metadata={"user_id": user_id},
    )


class TestGetSubscription:
    @pytest.mark.asyncio
    async def test_get_subscription_no_sub(
        self, client: AsyncClient, auth_headers
    ):
        response = await client.get("/api/subscription", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == {
            "active": False,
            "platform": None,
            "expiresAt": None,
        }

    @pytest.mark.asyncio
    async def test_get_subscription_with_active(
        self,
        client: AsyncClient,
        auth_headers,
        db: AsyncSession,
        test_user: User,
    ):
        db.add(
            Subscription(
                user_id=test_user.id,
                purchase_token="test_token",
                product_id="premium_monthly",
                active=True,
                expires_at=datetime.now(timezone.utc) + timedelta(days=30),
            )
        )
        await db.commit()

        response = await client.get("/api/subscription", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["active"] is True
        assert response.json()["platform"] == "google"
        assert response.json()["expiresAt"] is not None

    @pytest.mark.asyncio
    async def test_get_subscription_unauthenticated(self, client: AsyncClient):
        assert (await client.get("/api/subscription")).status_code == 401


class TestIsPremium:
    @pytest.mark.asyncio
    async def test_is_premium_not_premium(
        self, client: AsyncClient, auth_headers
    ):
        response = await client.get(
            "/api/subscription/is_premium", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["premium"] is False

    @pytest.mark.asyncio
    async def test_is_premium_active(
        self,
        client: AsyncClient,
        auth_headers,
        db: AsyncSession,
        test_user: User,
    ):
        test_user.premium = True
        test_user.subscription_expires = datetime.now(timezone.utc) + timedelta(
            days=30
        )
        await db.commit()

        response = await client.get(
            "/api/subscription/is_premium", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["premium"] is True

    @pytest.mark.asyncio
    async def test_is_premium_expired(
        self,
        client: AsyncClient,
        auth_headers,
        db: AsyncSession,
        test_user: User,
    ):
        test_user.premium = True
        test_user.subscription_expires = datetime.now(timezone.utc) - timedelta(
            days=1
        )
        await db.commit()

        response = await client.get(
            "/api/subscription/is_premium", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["premium"] is False
        assert (
            await db.scalar(select(User.premium).where(User.id == test_user.id))
            is False
        )

    @pytest.mark.asyncio
    async def test_is_premium_unauthenticated(self, client: AsyncClient):
        response = await client.get("/api/subscription/is_premium")
        assert response.status_code == 401


class TestCreatePayment:
    @pytest.mark.asyncio
    async def test_create_payment(
        self,
        client: AsyncClient,
        auth_headers,
        db: AsyncSession,
        test_user: User,
        monkeypatch,
    ):
        fake_payment = SimpleNamespace(
            id="payment_id",
            confirmation=SimpleNamespace(confirmation_url="https://fake"),
        )
        create = AsyncMock(return_value=fake_payment)
        monkeypatch.setattr(
            "src.routers.subscription.yookassa_gateway.create_payment", create
        )

        response = await client.post(
            "/api/subscription/payment", json={}, headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["confirmationUrl"] == "https://fake"
        payment = await db.scalar(
            select(MPayment).where(MPayment.user_id == test_user.id)
        )
        assert payment is not None
        assert payment.status == "in_progress"
        payment_data = create.await_args.args[0]
        assert payment_data["description"] == "Foodler Premium"
        assert test_user.email not in str(payment_data)

    @pytest.mark.asyncio
    async def test_create_payment_unauthenticated(self, client: AsyncClient):
        assert (
            await client.post("/api/subscription/payment")
        ).status_code == 401


class TestYookassaWebhook:
    @pytest.mark.asyncio
    async def test_succeeded_webhook_is_verified_and_idempotent(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_headers,
        monkeypatch,
    ):
        payment = MPayment(
            id="payment_123",
            user_id=test_user.id,
            status="in_progress",
        )
        db.add(payment)
        await db.commit()
        get_payment = AsyncMock(
            return_value=_remote_payment("payment_123", test_user.id)
        )
        monkeypatch.setattr(
            "src.routers.subscription.yookassa_gateway.get_payment", get_payment
        )
        payload = {
            "type": "notification",
            "event": "payment.succeeded",
            "object": {"id": "payment_123"},
        }

        first = await client.post(
            "/api/subscription/yookassa/webhook", json=payload
        )
        assert first.status_code == 200
        assert first.json()["status"] == "processed"
        await db.refresh(payment)
        await db.refresh(test_user)
        assert payment.status == "success"
        assert test_user.premium is True
        first_expiry = test_user.subscription_expires
        subscription = await db.scalar(
            select(Subscription).where(Subscription.user_id == test_user.id)
        )
        assert subscription is not None
        assert subscription.purchase_token == "yookassa:payment_123"
        subscription_response = await client.get(
            "/api/subscription",
            headers=auth_headers,
        )
        assert subscription_response.json()["platform"] == "yookassa"

        duplicate = await client.post(
            "/api/subscription/yookassa/webhook", json=payload
        )
        assert duplicate.status_code == 200
        assert duplicate.json()["status"] == "already_processed"
        await db.refresh(test_user)
        assert test_user.subscription_expires == first_expiry
        assert get_payment.await_count == 2

    @pytest.mark.asyncio
    async def test_forged_webhook_does_not_mutate_payment(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        monkeypatch,
    ):
        payment = MPayment(
            id="payment_forged",
            user_id=test_user.id,
            status="in_progress",
        )
        db.add(payment)
        await db.commit()
        monkeypatch.setattr(
            "src.routers.subscription.yookassa_gateway.get_payment",
            AsyncMock(
                return_value=_remote_payment("payment_forged", "another-user")
            ),
        )

        response = await client.post(
            "/api/subscription/yookassa/webhook",
            json={
                "type": "notification",
                "event": "payment.succeeded",
                "object": {"id": "payment_forged"},
            },
        )
        assert response.status_code == 400
        await db.refresh(payment)
        await db.refresh(test_user)
        assert payment.status == "in_progress"
        assert test_user.premium is False

    @pytest.mark.asyncio
    async def test_canceled_webhook_marks_pending_payment_rejected(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        monkeypatch,
    ):
        payment = MPayment(
            id="payment_canceled",
            user_id=test_user.id,
            status="in_progress",
        )
        db.add(payment)
        await db.commit()
        monkeypatch.setattr(
            "src.routers.subscription.yookassa_gateway.get_payment",
            AsyncMock(
                return_value=_remote_payment(
                    "payment_canceled",
                    test_user.id,
                    payment_status="canceled",
                    paid=False,
                )
            ),
        )

        response = await client.post(
            "/api/subscription/yookassa/webhook",
            json={
                "type": "notification",
                "event": "payment.canceled",
                "object": {"id": "payment_canceled"},
            },
        )
        assert response.status_code == 200
        await db.refresh(payment)
        assert payment.status == "rejected"

    @pytest.mark.asyncio
    async def test_webhook_rejects_malformed_payload(self, client: AsyncClient):
        response = await client.post(
            "/api/subscription/yookassa/webhook",
            content=b"not-json",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422


class TestCreatePaymentLimit:
    @pytest.mark.asyncio
    async def test_create_payment_429_when_three_pending(
        self,
        client: AsyncClient,
        auth_headers,
        db: AsyncSession,
        test_user: User,
        monkeypatch,
    ):
        for index in range(3):
            db.add(
                MPayment(
                    id=f"payment_{index}",
                    user_id=test_user.id,
                    status="in_progress",
                )
            )
        await db.commit()
        create = AsyncMock()
        monkeypatch.setattr(
            "src.routers.subscription.yookassa_gateway.create_payment", create
        )

        response = await client.post(
            "/api/subscription/payment", json={}, headers=auth_headers
        )
        assert response.status_code == 429
        create.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_create_payment_200_with_one_pending(
        self,
        client: AsyncClient,
        auth_headers,
        db: AsyncSession,
        test_user: User,
        monkeypatch,
    ):
        db.add(
            MPayment(
                id="payment_one",
                user_id=test_user.id,
                status="in_progress",
            )
        )
        await db.commit()
        fake_payment = SimpleNamespace(
            id="payment_id",
            confirmation=SimpleNamespace(confirmation_url="https://fake"),
        )
        monkeypatch.setattr(
            "src.routers.subscription.yookassa_gateway.create_payment",
            AsyncMock(return_value=fake_payment),
        )

        response = await client.post(
            "/api/subscription/payment", json={}, headers=auth_headers
        )
        assert response.status_code == 200
        payments = (
            await db.scalars(
                select(MPayment).where(MPayment.user_id == test_user.id)
            )
        ).all()
        assert len(payments) == 2
