"""
Tests for receipt API endpoints - /api/receipts/*
"""

import uuid

import pytest
from httpx import AsyncClient

from src.integrations.receipts import get_receipt_gateway
from src.main import app


class TestListReceipts:
    """Tests for GET /api/receipts"""

    @pytest.mark.asyncio
    async def test_list_receipts_empty(self, client: AsyncClient, auth_headers):
        """Should return empty list with no receipts."""
        response = await client.get("/api/receipts", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_list_receipts(self, client: AsyncClient, auth_headers, test_receipt):
        """Should list user's receipts."""
        response = await client.get("/api/receipts", headers=auth_headers)
        receipts = response.json()
        assert len(receipts) == 1
        assert receipts[0]["id"] == test_receipt.id
        assert receipts[0]["store"] == "Магнит"
        assert receipts[0]["total"] == 850.50
        assert len(receipts[0]["items"]) == 3

    @pytest.mark.asyncio
    async def test_list_receipts_is_paginated(
        self,
        client: AsyncClient,
        auth_headers,
        test_receipts,
    ):
        first = await client.get(
            "/api/receipts?offset=0&limit=2",
            headers=auth_headers,
        )
        second = await client.get(
            "/api/receipts?offset=2&limit=2",
            headers=auth_headers,
        )
        assert first.status_code == 200
        assert len(first.json()) == 2
        assert first.headers["X-Total-Count"] == "3"
        assert first.headers["X-Page-Offset"] == "0"
        assert first.headers["X-Page-Limit"] == "2"
        assert len(second.json()) == 1
        assert second.headers["X-Total-Count"] == "3"


class TestCreateReceipt:
    """Tests for POST /api/receipts"""

    @pytest.mark.asyncio
    async def test_create_receipt(self, client: AsyncClient, auth_headers):
        """Should create a new receipt."""
        receipt_data = {
            "id": uuid.uuid4().hex,
            "date": "2024-06-01",
            "store": "Ашан",
            "total": 1500.0,
            "items": [
                {"name": "Хлеб", "quantity": 1, "price": 50.0},
                {"name": "Молоко", "quantity": 2, "price": 150.0},
            ],
        }
        response = await client.post("/api/receipts", headers=auth_headers, json=receipt_data)
        assert response.status_code == 201
        assert response.json() == {"status": "ok"}

    @pytest.mark.asyncio
    async def test_create_receipt_no_items(self, client: AsyncClient, auth_headers):
        """Should create receipt with empty items list."""
        receipt_data = {
            "id": uuid.uuid4().hex,
            "date": "2024-06-01",
            "store": "Магнит",
            "total": 500.0,
            "items": [],
        }
        response = await client.post("/api/receipts", headers=auth_headers, json=receipt_data)
        assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_bulk_create_ignores_duplicate_fiscal_qr(self, client: AsyncClient, auth_headers):
        source_key = "t=20260723T1707&s=684.38&fn=7382440800075114&i=44391&fp=3657201638&n=1"
        response = await client.post(
            "/api/receipts/array",
            headers=auth_headers,
            json={
                "receipts": [
                    {"id": "first", "date": "2026-07-23", "total": 684.38, "source_key": source_key},
                    {"id": "second", "date": "2026-07-23", "total": 684.38, "source_key": source_key.upper()},
                ]
            },
        )

        assert response.status_code == 201
        receipts = await client.get("/api/receipts", headers=auth_headers)
        assert [receipt["id"] for receipt in receipts.json()] == ["first"]


class TestGetReceiptByRawQr:
    """Tests for the receipt image-recognition routes."""

    @pytest.mark.asyncio
    async def test_anonymous_user_can_recognize_receipt_image(self, client: AsyncClient):
        class Gateway:
            async def recognize_image(self, *_args, **_kwargs):
                return {"code": 0, "data": None}

        app.dependency_overrides[get_receipt_gateway] = Gateway
        try:
            response = await client.post(
                "/receipts/get_receipt_by_raw_qr",
                files={"qrfile": ("receipt.jpg", b"image", "image/jpeg")},
            )
        finally:
            app.dependency_overrides.pop(get_receipt_gateway, None)

        assert response.status_code == 200
        assert response.json() == {"code": 0, "data": None, "request": None}

    @pytest.mark.asyncio
    async def test_provider_specific_item_fields_do_not_fail_guest_recognition(
        self, client: AsyncClient
    ):
        class Gateway:
            async def recognize_image(self, *_args, **_kwargs):
                return {
                    "code": 1,
                    "data": {
                        "json": {
                            "ticketDate": "2026-08-06T11:46:13+00:00",
                            "totalSum": 15990,
                            "items": [
                                {
                                    "name": "Молоко",
                                    "quantity": 1,
                                    "price": 8990,
                                    "unit": "шт",
                                }
                            ],
                        }
                    },
                }

        app.dependency_overrides[get_receipt_gateway] = Gateway
        try:
            response = await client.post(
                "/receipts/get_receipt_by_raw_qr",
                files={"qrfile": ("receipt.jpg", b"image", "image/jpeg")},
            )
        finally:
            app.dependency_overrides.pop(get_receipt_gateway, None)

        assert response.status_code == 200
        assert response.json()["data"]["json"]["items"][0]["unit"] == "шт"

    @pytest.mark.asyncio
    async def test_authenticated_user_saves_recognized_receipt(
        self, client: AsyncClient, auth_headers
    ):
        class Gateway:
            async def recognize_image(self, *_args, **_kwargs):
                return {
                    "code": 1,
                    "data": {
                        "json": {
                            "ticketDate": "2026-08-06T11:46:13+00:00",
                            "operationType": 1,
                            "totalSum": 15990,
                            "user": "Магнит",
                            "items": [
                                {
                                    "name": "Молоко",
                                    "quantity": 1,
                                    "price": 8990,
                                    "unit": "шт",
                                }
                            ],
                        }
                    },
                }

        app.dependency_overrides[get_receipt_gateway] = Gateway
        try:
            response = await client.post(
                "/api/receipts/get_receipt_by_raw_qr",
                headers=auth_headers,
                files={"qrfile": ("receipt.jpg", b"image", "image/jpeg")},
            )
        finally:
            app.dependency_overrides.pop(get_receipt_gateway, None)

        assert response.status_code == 200
        receipts = await client.get("/api/receipts", headers=auth_headers)
        assert receipts.status_code == 200
        saved_receipts = receipts.json()
        assert len(saved_receipts) == 1
        assert saved_receipts[0]["date"] == "2026-08-06"
        assert saved_receipts[0]["store"] == "Магнит"
        assert saved_receipts[0]["total"] == 159.9
        assert saved_receipts[0]["items"] == [
            {
                "name": "Молоко",
                "quantity": 1,
                "unit": "kg",
                "price": 89.9,
                "sum": None,
                "product_id": None,
                "gtin": None,
                "category": "прочее",
            }
        ]


class TestGetReceipt:
    """Tests for GET /api/receipts/{receipt_id}"""

    @pytest.mark.asyncio
    async def test_get_receipt_by_id(self, client: AsyncClient, auth_headers, test_receipt):
        """Should get a receipt by ID."""
        response = await client.get(f"/api/receipts/{test_receipt.id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_receipt.id
        assert data["store"] == "Магнит"
        assert len(data["items"]) == 3

    @pytest.mark.asyncio
    async def test_get_nonexistent_receipt(self, client: AsyncClient, auth_headers):
        """Should return 404 for non-existent receipt."""
        response = await client.get("/api/receipts/nonexistent", headers=auth_headers)
        assert response.status_code == 404


class TestUpdateReceipt:
    """Tests for PATCH /api/receipts/{receipt_id}"""

    @pytest.mark.asyncio
    async def test_update_receipt(self, client: AsyncClient, auth_headers, test_receipt):
        """Should update a receipt."""
        update_data = {
            "id": test_receipt.id,
            "date": "2024-06-15",
            "store": "Пятёрочка",
            "total": 999.99,
            "items": [{"name": "Обновленный товар", "quantity": 1, "price": 999.99}],
        }
        response = await client.patch(
            f"/api/receipts/{test_receipt.id}", headers=auth_headers, json=update_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["store"] == "Пятёрочка"
        assert data["total"] == 999.99
        assert len(data["items"]) == 1


class TestDeleteReceipt:
    """Tests for DELETE /api/receipts/{receipt_id}"""

    @pytest.mark.asyncio
    async def test_delete_receipt(self, client: AsyncClient, auth_headers, test_receipt):
        """Should delete a receipt."""
        response = await client.delete(f"/api/receipts/{test_receipt.id}", headers=auth_headers)
        assert response.status_code == 204

        # Verify it's gone
        get_response = await client.get(f"/api/receipts/{test_receipt.id}", headers=auth_headers)
        assert get_response.status_code == 404


class TestCleanupReceipts:
    """Retention is internal and cannot be triggered through the public API."""

    @pytest.mark.asyncio
    async def test_cleanup_endpoint_is_not_public(self, client: AsyncClient, auth_headers):
        response = await client.post("/api/receipts/cleanup", headers=auth_headers)
        assert response.status_code == 405
