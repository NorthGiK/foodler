from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from src.auth import create_access_token
from src.models import User
from src.routers.product_analytics import _ACCOUNT_ID_DOMAIN, _DEVICE_ID_DOMAIN, _analytics_id


def _legacy_events_body() -> dict:
    return {
        "installationId": "installation_identifier_0001",
        "platform": "android",
        "appVersion": "1.2.3",
        "appBuild": "123",
        "osVersion": "14",
        "locale": "ru-RU",
        "timezone": "Asia/Yekaterinburg",
        "events": [
            {
                "eventId": "event_identifier_0001",
                "eventName": "app_opened",
                "occurredAt": datetime.now(timezone.utc).isoformat(),
            }
        ],
    }


@pytest.mark.asyncio
async def test_deprecated_ingestion_keeps_legacy_wire_shape_but_never_accepts(client):
    response = await client.post("/api/product-analytics/events", json=_legacy_events_body())

    assert response.status_code == 200
    assert response.json() == {"accepted": False, "inserted": 0}


@pytest.mark.asyncio
async def test_invalid_token_is_not_downgraded_to_guest(client):
    response = await client.post(
        "/api/product-analytics/events",
        headers={"Authorization": "Bearer invalid"},
        json=_legacy_events_body(),
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_identity_requires_authentication(client):
    response = await client.post(
        "/api/product-analytics/identity/resolve", json={"deviceId": "device_identifier_0001"}
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_identified_identity_is_stable_and_domain_separated(client, auth_headers, test_user):
    body = {"deviceId": "device_identifier_0001"}
    first = await client.post("/api/product-analytics/identity/resolve", headers=auth_headers, json=body)
    second = await client.post("/api/product-analytics/identity/resolve", headers=auth_headers, json=body)

    assert first.status_code == 200
    assert first.json() == second.json()
    identity = first.json()
    assert identity["mode"] == "identified"
    assert identity["accountAnalyticsId"] == _analytics_id(_ACCOUNT_ID_DOMAIN, test_user.id)
    assert identity["deviceAnalyticsId"] == _analytics_id(_DEVICE_ID_DOMAIN, body["deviceId"])
    assert identity["accountAnalyticsId"] != identity["deviceAnalyticsId"]
    assert test_user.id not in str(identity)
    assert body["deviceId"] not in str(identity)


@pytest.mark.asyncio
async def test_anonymous_mode_never_returns_foodler_identifiers(client, async_session, auth_headers, test_user):
    changed = await client.put(
        "/api/product-analytics/identity-mode", headers=auth_headers, json={"mode": "anonymous"}
    )
    resolved = await client.post(
        "/api/product-analytics/identity/resolve",
        headers=auth_headers,
        json={"deviceId": "device_identifier_0001"},
    )
    await async_session.refresh(test_user)

    assert changed.json() == {
        "mode": "anonymous",
        "accountAnalyticsId": None,
        "deviceAnalyticsId": None,
    }
    assert resolved.json() == changed.json()
    assert test_user.analytics_identity_mode == "anonymous"


@pytest.mark.asyncio
async def test_deprecated_preference_maps_authenticated_boolean_to_identity_mode(
    client, async_session, auth_headers, test_user
):
    body = {"installationId": "installation_identifier_0001", "enabled": False}
    disabled = await client.put("/api/product-analytics/preference", headers=auth_headers, json=body)
    await async_session.refresh(test_user)
    assert disabled.json() == {"enabled": False}
    assert test_user.analytics_identity_mode == "anonymous"

    enabled = await client.put(
        "/api/product-analytics/preference",
        headers=auth_headers,
        json={**body, "enabled": True},
    )
    await async_session.refresh(test_user)
    assert enabled.json() == {"enabled": True}
    assert test_user.analytics_identity_mode == "identified"


@pytest.mark.asyncio
async def test_guest_compatibility_preference_remains_anonymous(client):
    response = await client.put(
        "/api/product-analytics/preference",
        json={"installationId": "installation_identifier_0001", "enabled": True},
    )

    assert response.status_code == 200
    assert response.json() == {"enabled": False}


@pytest.mark.asyncio
async def test_identity_mode_is_account_scoped(client, async_session, auth_headers):
    other = User(email="other@example.com", password_hash="hash", premium=False)
    async_session.add(other)
    await async_session.commit()
    other_headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    await client.put(
        "/api/product-analytics/identity-mode", headers=auth_headers, json={"mode": "anonymous"}
    )
    other_identity = await client.post(
        "/api/product-analytics/identity/resolve",
        headers=other_headers,
        json={"deviceId": "device_identifier_0001"},
    )

    assert other_identity.json()["mode"] == "identified"
    assert await async_session.scalar(select(User.analytics_identity_mode).where(User.id == other.id)) == "identified"
