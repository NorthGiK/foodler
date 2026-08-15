"""
Integration tests - end-to-end flows.
"""

import uuid

import pytest
from httpx import AsyncClient


class TestFullUserFlow:
    """Complete user journey through the application."""

    @pytest.mark.asyncio
    async def test_register_and_use_app(self, client: AsyncClient, test_user, auth_headers):
        """Full flow: register user, add receipts, check analytics."""
        # 1. Get user profile
        response = await client.get("/api/users/me", headers=auth_headers)
        assert response.status_code == 200

        # 2. Register a device
        response = await client.post(
            "/api/devices/register",
            headers=auth_headers,
            json={"deviceId": "test_device", "model": "TestPhone", "os": "TestOS"},
        )
        assert response.status_code == 201

        # 3. Create a receipt
        receipt_id = uuid.uuid4().hex
        response = await client.post(
            "/api/receipts",
            headers=auth_headers,
            json={
                "id": receipt_id,
                "date": "2024-06-15",
                "store": "Тестовый магазин",
                "total": 1500.50,
                "items": [
                    {"name": "Хлеб", "quantity": 1, "price": 50.0},
                    {"name": "Молоко", "quantity": 2, "price": 150.0},
                    {"name": "Яблоки", "quantity": 1.5, "price": 200.0},
                ],
            },
        )
        assert response.status_code == 201

        # 4. Get receipt by ID
        response = await client.get(f"/api/receipts/{receipt_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["store"] == "Тестовый магазин"
        assert len(response.json()["items"]) == 3

        # 5. Get spending analytics
        response = await client.get("/api/analytics/spending", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["receipt_count"] == 1
        assert response.json()["total_spent"] == 1500.50

        # 6. List receipts
        response = await client.get("/api/receipts", headers=auth_headers)
        assert response.status_code == 200
        assert len(response.json()) == 1

    @pytest.mark.asyncio
    async def test_unauthenticated_access(self, client: AsyncClient):
        """Verify that protected endpoints reject unauthenticated requests."""
        protected_endpoints = [
            ("GET", "/api/users/me"),
            ("GET", "/api/devices"),
            ("GET", "/api/receipts"),
            ("GET", "/api/analytics/spending"),
            ("GET", "/api/analytics/nutrition"),
            ("GET", "/api/fridge"),
            ("GET", "/api/subscription"),
        ]

        for method, endpoint in protected_endpoints:
            if method == "GET":
                response = await client.get(endpoint)
            elif method == "POST":
                response = await client.post(endpoint, json={})
            elif method == "DELETE":
                response = await client.delete(endpoint)
            assert response.status_code in (
                401,  # FastAPI returns 401 for missing bearer
            ), f"Endpoint {method} {endpoint} returned {response.status_code}"


class TestProductKnowledgeFlow:
    """Product knowledge base flow."""

    @pytest.mark.asyncio
    async def test_search_and_match_products(self, client: AsyncClient, test_products):
        """Search products, match by name, get details."""
        # 1. Search for a product
        response = await client.get("/api/products/search?query=молоко")
        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) > 0

        # 2. Get first product details
        product_id = results[0]["id"]
        response = await client.get(f"/api/products/{product_id}")
        assert response.status_code == 200
        assert response.json()["id"] == product_id

        # 3. Match product by raw name
        response = await client.post(
            "/api/products/match",
            json={"raw_name": "молоко 2.5", "quantity": 1},
        )
        assert response.status_code == 200
        assert response.json()["product"] is not None

    @pytest.mark.asyncio
    async def test_recipe_and_fridge_flow(
        self, client: AsyncClient, test_user, auth_headers, test_receipt, test_recipe
    ):
        """Create receipts, check fridge and recipe suggestions."""
        # 1. Check fridge status
        response = await client.get("/api/fridge", headers=auth_headers)
        assert response.status_code == 200
        fridge = response.json()
        assert len(fridge) > 0

        # 2. List all recipes (public)
        response = await client.get("/api/recipes")
        assert response.status_code == 200
        assert len(response.json()) >= 1

    @pytest.mark.asyncio
    async def test_unsupported_google_subscription_is_fail_closed(
        self, client: AsyncClient, test_user, auth_headers
    ):
        """A removed legacy purchase route must not grant premium."""
        response = await client.get("/api/subscription", headers=auth_headers)
        assert response.json()["active"] is False

        response = await client.post(
            "/api/subscription/google",
            headers=auth_headers,
            json={"purchaseToken": "integration_token", "productId": "monthly"},
        )
        assert response.status_code == 404

        response = await client.get("/api/users/me", headers=auth_headers)
        assert response.json()["premium"] is False


class TestAuthFlow:
    """Authentication and token flow."""

    @pytest.mark.asyncio
    async def test_login_and_refresh(self, client: AsyncClient, test_user):
        """Login, get tokens, refresh access token."""
        # 1. Login
        response = await client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "TestPass123!"},
        )
        assert response.status_code == 200
        tokens = response.json()
        access_token = tokens["accessToken"]
        refresh_token = tokens["refreshToken"]

        # 2. Use access token
        response = await client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert response.status_code == 200

        # 3. Refresh token
        response = await client.post(
            "/api/auth/refresh",
            json={"refreshToken": refresh_token},
        )
        assert response.status_code == 200
        new_tokens = response.json()
        # New refresh token should be different from old one
        assert new_tokens["refreshToken"] != refresh_token

        # 4. Use new access token
        response = await client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {new_tokens['accessToken']}"},
        )
        assert response.status_code == 200
