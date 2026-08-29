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
        assert data["analyticsIdentityEnabled"] is True
        assert isinstance(data["analyticsExternalId"], str)
        assert data["analyticsExternalId"]
        assert "subscriptionExpires" in data
        assert data["createdAt"].endswith("Z")

    @pytest.mark.asyncio
    async def test_get_me_unauthenticated(self, client: AsyncClient):
        """Should return 401 when not authenticated."""
        response = await client.get("/api/users/me")
        assert response.status_code == 401


class TestAnalyticsIdentityContract:
    @pytest.mark.asyncio
    async def test_requires_authentication(self, client: AsyncClient):
        response = await client.put(
            "/api/users/me/analytics-identity", json={"enabled": False}
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_wire_format(self, client: AsyncClient, auth_headers):
        disabled = await client.put(
            "/api/users/me/analytics-identity",
            headers=auth_headers,
            json={"enabled": False},
        )
        assert disabled.status_code == 200
        assert disabled.json() == {"enabled": False, "analyticsExternalId": None}

        enabled = await client.put(
            "/api/users/me/analytics-identity",
            headers=auth_headers,
            json={"enabled": True},
        )
        assert enabled.status_code == 200
        external_id = enabled.json()["analyticsExternalId"]
        assert enabled.json() == {"enabled": True, "analyticsExternalId": external_id}
        assert isinstance(external_id, str)
        assert external_id

        profile = await client.get("/api/users/me", headers=auth_headers)
        assert profile.json()["analyticsExternalId"] == external_id

    @pytest.mark.asyncio
    async def test_legacy_routes_are_absent(self, client: AsyncClient):
        assert (await client.post("/api/product-analytics/events", json={})).status_code == 404
        assert (
            await client.put("/api/product-analytics/preference", json={})
        ).status_code == 404

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
