"""
Tests for device API endpoints - /api/devices/*
"""

import pytest
from httpx import AsyncClient


class TestListDevices:
    """Tests for GET /api/devices"""

    @pytest.mark.asyncio
    async def test_list_devices_empty(self, client: AsyncClient, auth_headers):
        """Should return empty list when no devices."""
        response = await client.get("/api/devices", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_list_devices_unauthenticated(self, client: AsyncClient):
        """Should return 401 when not authenticated."""
        response = await client.get("/api/devices")
        assert response.status_code == 401


class TestRegisterDevice:
    """Tests for POST /api/devices/register"""

    @pytest.mark.asyncio
    async def test_register_device_success(self, client: AsyncClient, auth_headers):
        """Should register a new device."""
        response = await client.post(
            "/api/devices/register",
            headers=auth_headers,
            json={"deviceId": "device_123", "model": "iPhone 15", "os": "iOS 17"},
        )
        assert response.status_code == 201
        assert response.json() == {"status": "ok"}

    @pytest.mark.asyncio
    async def test_register_device_minimal(self, client: AsyncClient, auth_headers):
        """Should register with only deviceId."""
        response = await client.post(
            "/api/devices/register",
            headers=auth_headers,
            json={"deviceId": "device_456"},
        )
        assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_register_device_twice(self, client: AsyncClient, auth_headers):
        """Should allow registering the same device ID multiple times."""
        for _ in range(2):
            response = await client.post(
                "/api/devices/register",
                headers=auth_headers,
                json={"deviceId": "device_789"},
            )
            assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_register_and_list(self, client: AsyncClient, auth_headers):
        """Registered devices should appear in listing."""
        await client.post(
            "/api/devices/register",
            headers=auth_headers,
            json={"deviceId": "device_111", "model": "Pixel 8", "os": "Android 14"},
        )

        response = await client.get("/api/devices", headers=auth_headers)
        devices = response.json()
        assert len(devices) == 1
        assert devices[0]["deviceId"] == "device_111"
        assert devices[0]["model"] == "Pixel 8"
        assert devices[0]["os"] == "Android 14"


class TestRemoveDevice:
    """Tests for DELETE /api/devices/{device_id}"""

    @pytest.mark.asyncio
    async def test_remove_existing_device(
        self, client: AsyncClient, auth_headers, async_session, test_user
    ):
        """Should remove an existing device."""
        from src.models import Device

        device = Device(device_id="to_delete", user_id=test_user.id)
        async_session.add(device)
        await async_session.commit()

        response = await client.delete(f"/api/devices/{device.id}", headers=auth_headers)
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_remove_nonexistent_device(self, client: AsyncClient, auth_headers):
        """Should return 404 for non-existent device."""
        response = await client.delete("/api/devices/nonexistent_id", headers=auth_headers)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_remove_other_users_device(
        self, client: AsyncClient, auth_headers, async_session
    ):
        """Should not be able to remove another user's device."""
        from src.models import Device, User

        other_user = User(email="other@example.com", password_hash="hash")
        async_session.add(other_user)
        await async_session.flush()

        device = Device(device_id="others_device", user_id=other_user.id)
        async_session.add(device)
        await async_session.commit()

        response = await client.delete(f"/api/devices/{device.id}", headers=auth_headers)
        assert response.status_code == 404
