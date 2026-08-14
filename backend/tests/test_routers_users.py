"""
Tests for user API endpoints - /api/users/*
"""

import pytest
from httpx import AsyncClient


class TestGetMe:
    """Tests for GET /api/users/me"""

    @pytest.mark.asyncio
    async def test_get_me_authenticated(self, client: AsyncClient, auth_headers):
        """Should return user profile when authenticated."""
        response = await client.get("/api/users/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "email" in data
        assert data["email"] == "test@example.com"
        assert "premium" in data
        assert data["analyticsEnabled"] is True
        assert "subscriptionExpires" in data
        assert data["createdAt"].endswith("Z")

    @pytest.mark.asyncio
    async def test_get_me_unauthenticated(self, client: AsyncClient):
        """Should return 401 when not authenticated."""
        response = await client.get("/api/users/me")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_invalid_token(self, client: AsyncClient):
        """Should return 401 with invalid token."""
        response = await client.get(
            "/api/users/me",
            headers={"Authorization": "Bearer invalid_token_here"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_premium_user(self, client: AsyncClient, premium_auth_headers):
        """Should return premium status for premium user."""
        response = await client.get("/api/users/me", headers=premium_auth_headers)
        data = response.json()
        assert data["premium"] is True
        assert data["subscriptionExpires"] is not None
