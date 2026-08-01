"""
Tests for auth API endpoints - /api/auth/*
"""

import pytest
from httpx import AsyncClient


class TestSendCode:
    """Tests for POST /api/auth/send-code"""

    @pytest.mark.asyncio
    async def test_send_code_success(self, client: AsyncClient):
        """Should send verification code successfully."""
        response = await client.post(
            "/api/auth/send-code",
            json={"email": "test@example.com", "password": "TestPass123!"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Verification code sent"

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
            json={"email": "test@example.com", "code": "invalid_code", "password": "TestPass123!"},
        )
        assert response.status_code == 401
        assert "Invalid or expired" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_verify_code_valid(self, client: AsyncClient, async_session):
        """Should verify code and return tokens."""
        from src.models import EmailCodesStorage

        # Create a valid code
        storage = EmailCodesStorage(email="test@example.com")
        async_session.add(storage)
        await async_session.commit()

        response = await client.post(
            "/api/auth/verify-code",
            json={
                "email": "test@example.com",
                "code": storage.code,
                "password": "TestPass123!",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "accessToken" in data
        assert "refreshToken" in data
        assert "user" in data
        assert data["user"]["email"] == "test@example.com"


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
            json={"refreshToken": "test_refresh_token_123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "accessToken" in data
        assert "refreshToken" in data
        assert data["refreshToken"] != "test_refresh_token_123"  # New token

    @pytest.mark.asyncio
    async def test_refresh_invalid_token(self, client: AsyncClient):
        """Should reject invalid refresh token."""
        response = await client.post(
            "/api/auth/refresh",
            json={"refreshToken": "invalid_token"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_expired_token(self, client: AsyncClient, test_expired_refresh_token):
        """Should reject expired refresh token."""
        response = await client.post(
            "/api/auth/refresh",
            json={"refreshToken": "test_expired_refresh_token_456"},
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