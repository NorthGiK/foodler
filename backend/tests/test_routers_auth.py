"""
Tests for auth API endpoints - /api/auth/*
"""

from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from src.auth import verify_password
from src.models import EmailCodesStorage


class TestSendCode:
    """Tests for POST /api/auth/send-code"""

    @pytest.mark.asyncio
    async def test_send_code_success(self, client: AsyncClient, monkeypatch):
        """Should send verification code successfully."""
        send_code = AsyncMock(return_value=True)
        monkeypatch.setattr("src.routers.auth.EmailService.send_code", send_code)
        response = await client.post(
            "/api/auth/send-code",
            json={"email": "test@example.com", "password": "TestPass123!"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Verification code sent"
        send_code.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_send_code_invalid_email(self, client: AsyncClient):
        """Should reject invalid email format."""
        response = await client.post(
            "/api/auth/send-code",
            json={"email": "not-an-email", "password": "TestPass123!"},
        )
        assert response.status_code == 422  # Validation error


class TestVerifyCode:
    """Tests for POST /api/auth/verify-code"""

    @pytest.mark.asyncio
    async def test_verify_code_invalid(self, client: AsyncClient):
        """Should reject invalid verification code."""
        response = await client.post(
            "/api/auth/verify-code",
            json={"email": "test@example.com", "code": "00000000", "password": "TestPass123!"},
        )
        assert response.status_code == 401
        assert "Invalid or expired" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_verify_code_valid(self, client: AsyncClient, async_session):
        """Should verify code and return tokens."""
        from src.auth import hash_email_code
        from src.models import EmailCodesStorage

        # Create a valid code
        code = "12345678"
        storage = EmailCodesStorage(
            email="test@example.com",
            code_hash=hash_email_code("test@example.com", code),
        )
        async_session.add(storage)
        await async_session.commit()

        response = await client.post(
            "/api/auth/verify-code",
            json={
                "email": "test@example.com",
                "code": code,
                "password": "TestPass123!",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "accessToken" in data
        assert "refreshToken" in data
        assert "user" in data
        assert data["user"]["email"] == "test@example.com"

    @pytest.mark.asyncio
    async def test_verify_code_logs_in_existing_user_without_revalidating_password(
        self,
        client: AsyncClient,
        async_session,
        monkeypatch,
        test_user,
    ):
        """Legacy passwords remain usable after stricter registration rules."""
        from src.auth import hash_email_code, hash_password
        from src.models import EmailCodesStorage

        legacy_password = "Aa1short"
        test_user.password_hash = hash_password(legacy_password)
        test_user.auth_version = 3
        original_hash = test_user.password_hash
        code = "12345678"
        monkeypatch.setattr(
            "src.routers.auth.issue_tokens",
            AsyncMock(return_value=("access-token", "refresh-token")),
        )
        async_session.add(
            EmailCodesStorage(
                email=test_user.email,
                code_hash=hash_email_code(test_user.email, code),
            )
        )
        await async_session.commit()

        response = await client.post(
            "/api/auth/verify-code",
            json={
                "email": test_user.email,
                "code": code,
                "password": legacy_password,
            },
        )

        assert response.status_code == 200
        await async_session.refresh(test_user)
        assert test_user.password_hash == original_hash
        assert test_user.auth_version == 3


class TestLogin:
    """Tests for POST /api/auth/login"""

    @pytest.mark.asyncio
    async def test_login_success(self, client: AsyncClient, test_user):
        """Should login successfully with valid credentials."""
        response = await client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "TestPass123!"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "accessToken" in data
        assert "refreshToken" in data
        assert data["user"]["email"] == "test@example.com"

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client: AsyncClient, test_user):
        """Should reject wrong password."""
        response = await client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "WrongPassword!"},
        )
        assert response.status_code == 401


class TestPasswordResetFlow:
    """Tests for the two-step password reset flow."""

    @pytest.mark.asyncio
    async def test_confirm_code_returns_one_time_reset_token(
        self, client: AsyncClient, async_session, test_user
    ):
        from src.auth import hash_email_code

        code = "12345678"
        async_session.add(
            EmailCodesStorage(
                email=test_user.email,
                code_hash=hash_email_code(test_user.email, code),
            )
        )
        await async_session.commit()

        response = await client.post(
            "/api/auth/forgot-password/confirm-code",
            json={"email": test_user.email, "code": code},
        )

        assert response.status_code == 200
        assert response.json()["resetToken"]
        reused = await client.post(
            "/api/auth/forgot-password/confirm-code",
            json={"email": test_user.email, "code": code},
        )
        assert reused.status_code == 401

    @pytest.mark.asyncio
    async def test_reset_password_with_token_revokes_sessions(
        self, client: AsyncClient, async_session, test_user
    ):
        from src.auth import create_password_reset_token

        original_version = test_user.auth_version
        token = create_password_reset_token(test_user.id, test_user.auth_version)
        response = await client.post(
            "/api/auth/forgot-password/reset",
            json={"resetToken": token, "new_password": "NewPass123!"},
        )

        assert response.status_code == 200
        await async_session.refresh(test_user)
        assert verify_password("NewPass123!", test_user.password_hash)
        assert test_user.auth_version == original_version + 1
        reused = await client.post(
            "/api/auth/forgot-password/reset",
            json={"resetToken": token, "new_password": "AnotherPass123!"},
        )
        assert reused.status_code == 401

    @pytest.mark.asyncio
    async def test_reset_password_rejects_invalid_token(self, client: AsyncClient):
        response = await client.post(
            "/api/auth/forgot-password/reset",
            json={
                "resetToken": "invalid-reset-token",
                "new_password": "NewPass123!",
            },
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Should reject non-existent user."""
        response = await client.post(
            "/api/auth/login",
            json={"email": "nonexistent@example.com", "password": "TestPass123!"},
        )
        assert response.status_code == 401


class TestRefreshToken:
    """Tests for POST /api/auth/refresh"""

    @pytest.mark.asyncio
    async def test_refresh_success(self, client: AsyncClient, test_refresh_token):
        """Should refresh token successfully."""
        response = await client.post(
            "/api/auth/refresh",
            json={"refreshToken": "test_refresh_token_123_secure_fixture_value"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "accessToken" in data
        assert "refreshToken" in data
        assert data["refreshToken"] != "test_refresh_token_123_secure_fixture_value"

    @pytest.mark.asyncio
    async def test_refresh_invalid_token(self, client: AsyncClient):
        """Should reject invalid refresh token."""
        response = await client.post(
            "/api/auth/refresh",
            json={"refreshToken": "invalid_token_value_that_is_long_enough"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_expired_token(self, client: AsyncClient, test_expired_refresh_token):
        """Should reject expired refresh token."""
        response = await client.post(
            "/api/auth/refresh",
            json={"refreshToken": "test_expired_refresh_token_456_secure_fixture"},
        )
        assert response.status_code == 401


class TestHealthCheck:
    """Tests for GET /health"""

    @pytest.mark.asyncio
    async def test_health_check(self, client: AsyncClient):
        """Health check should return ok."""
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
