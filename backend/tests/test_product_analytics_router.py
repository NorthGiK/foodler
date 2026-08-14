from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from src.auth import create_access_token
from src.models import AnalyticsEvent, AnalyticsInstallation, User


def _body(*, event_id: str = "event_identifier_0001", event_name: str = "app_opened") -> dict:
    return {
        "installationId": "installation_identifier_0001",
        "platform": "android",
        "appVersion": "1.2.3",
        "appBuild": "123",
        "osVersion": "14",
        "locale": "ru-RU",
        "timezone": "Asia/Yekaterinburg",
        "events": [{"eventId": event_id, "eventName": event_name, "occurredAt": datetime.now(timezone.utc).isoformat()}],
    }


@pytest.mark.asyncio
async def test_guest_ingestion_is_idempotent_and_does_not_store_raw_id(client, async_session):
    body = _body()
    first = await client.post("/api/product-analytics/events", json=body)
    replay = await client.post("/api/product-analytics/events", json=body)

    assert first.json() == {"accepted": True, "inserted": 1}
    assert replay.json() == {"accepted": True, "inserted": 0}
    installation = await async_session.scalar(select(AnalyticsInstallation))
    event = await async_session.scalar(select(AnalyticsEvent))
    assert installation is not None and installation.installation_hash != body["installationId"]
    assert event is not None and event.user_id is None and event.installation_id == installation.id
    assert (
        event.platform,
        event.app_version,
        event.app_build,
        event.os_version,
        event.locale,
        event.timezone,
    ) == ("android", "1.2.3", "123", "14", "ru-RU", "Asia/Yekaterinburg")


@pytest.mark.asyncio
async def test_authenticated_ingestion_links_only_verified_user(client, async_session, auth_headers, test_user):
    response = await client.post("/api/product-analytics/events", headers=auth_headers, json=_body())

    assert response.status_code == 200
    installation = await async_session.scalar(select(AnalyticsInstallation))
    event = await async_session.scalar(select(AnalyticsEvent))
    assert installation is not None and installation.user_id == test_user.id
    assert event is not None and event.user_id == test_user.id


@pytest.mark.asyncio
async def test_invalid_token_is_not_downgraded_to_guest(client):
    response = await client.post(
        "/api/product-analytics/events", headers={"Authorization": "Bearer invalid"}, json=_body()
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_rejects_unknown_events_properties_sensitive_fields_and_skew(client):
    unknown = _body(event_name="receipt_contents_uploaded")
    assert (await client.post("/api/product-analytics/events", json=unknown)).status_code == 422
    properties = _body(event_name="app_opened")
    properties["events"][0]["properties"] = {"email": "not-allowed"}
    assert (await client.post("/api/product-analytics/events", json=properties)).status_code == 422
    user_id = _body()
    user_id["userId"] = "client-controlled"
    assert (await client.post("/api/product-analytics/events", json=user_id)).status_code == 422
    skew = _body()
    skew["events"][0]["occurredAt"] = (datetime.now(timezone.utc) + timedelta(hours=25)).isoformat()
    assert (await client.post("/api/product-analytics/events", json=skew)).status_code == 422
    assert (
        await client.put(
            "/api/product-analytics/preference",
            json={"installationId": "installation_identifier_0001", "enabled": 1},
        )
    ).status_code == 422


@pytest.mark.asyncio
async def test_batch_bounds_and_payload_size(client):
    body = _body()
    body["events"] = [_body(event_id=f"event_identifier_{index:04d}")["events"][0] for index in range(50)]
    accepted = await client.post("/api/product-analytics/events", json=body)
    assert accepted.json() == {"accepted": True, "inserted": 50}
    body["events"] = [_body(event_id=f"event_identifier_{index:04d}")["events"][0] for index in range(51)]
    assert (await client.post("/api/product-analytics/events", json=body)).status_code == 422
    response = await client.post("/api/product-analytics/events", content=b"x" * (64 * 1024 + 1), headers={"content-type": "application/json"})
    assert response.status_code == 413


@pytest.mark.asyncio
async def test_linked_installation_cannot_be_claimed_by_another_user(
    client, async_session, auth_headers, test_user
):
    await client.post("/api/product-analytics/events", headers=auth_headers, json=_body())
    other = User(email="other@example.com", password_hash="hash", premium=False)
    async_session.add(other)
    await async_session.commit()
    other_headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    response = await client.post(
        "/api/product-analytics/events",
        headers=other_headers,
        json=_body(event_id="event_identifier_other"),
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_opt_out_anonymizes_guest_history_and_reenable_only_allows_new_events(
    client, async_session, auth_headers
):
    guest = _body(event_id="event_identifier_prelogin")
    await client.post("/api/product-analytics/events", json=guest)
    await client.post(
        "/api/product-analytics/events",
        headers=auth_headers,
        json=_body(event_id="event_identifier_linked"),
    )
    await client.put(
        "/api/product-analytics/preference",
        headers=auth_headers,
        json={"installationId": guest["installationId"], "enabled": False},
    )
    historical = await async_session.scalar(
        select(AnalyticsEvent).where(AnalyticsEvent.idempotency_id == "event_identifier_prelogin")
    )
    assert historical is not None and historical.user_id is None and historical.installation_id is None
    blocked = await client.post(
        "/api/product-analytics/events",
        headers=auth_headers,
        json=_body(event_id="event_identifier_blocked"),
    )
    assert blocked.json() == {"accepted": False, "inserted": 0}
    await client.put(
        "/api/product-analytics/preference",
        headers=auth_headers,
        json={"installationId": guest["installationId"], "enabled": True},
    )
    future = await client.post(
        "/api/product-analytics/events",
        headers=auth_headers,
        json=_body(event_id="event_identifier_after_optin"),
    )
    assert future.json() == {"accepted": True, "inserted": 1}
    assert historical.user_id is None and historical.installation_id is None


@pytest.mark.asyncio
async def test_guest_opt_out_blocks_new_events_until_reenabled(client, async_session):
    historical = _body(event_id="event_identifier_guest_history")
    await client.post("/api/product-analytics/events", json=historical)
    await client.put(
        "/api/product-analytics/preference",
        json={"installationId": historical["installationId"], "enabled": False},
    )
    saved = await async_session.scalar(
        select(AnalyticsEvent).where(AnalyticsEvent.idempotency_id == "event_identifier_guest_history")
    )
    assert saved is not None and saved.user_id is None and saved.installation_id is None
    blocked = _body(event_id="event_identifier_guest_blocked")
    assert (await client.post("/api/product-analytics/events", json=blocked)).json() == {
        "accepted": False,
        "inserted": 0,
    }
    assert await async_session.scalar(
        select(AnalyticsEvent.id).where(AnalyticsEvent.idempotency_id == "event_identifier_guest_blocked")
    ) is None
    await client.put(
        "/api/product-analytics/preference",
        json={"installationId": historical["installationId"], "enabled": True},
    )
    future = _body(event_id="event_identifier_guest_future")
    assert (await client.post("/api/product-analytics/events", json=future)).json() == {
        "accepted": True,
        "inserted": 1,
    }
    assert saved.user_id is None and saved.installation_id is None


@pytest.mark.asyncio
async def test_positive_taxonomy_properties_and_iana_timezones(client, async_session):
    body = _body()
    body["timezone"] = "UTC"
    body["events"] = [
        {"eventId": "event_identifier_tab", "eventName": "tab_viewed", "occurredAt": datetime.now(timezone.utc).isoformat(), "properties": {"tab": "assistant"}},
        {"eventId": "event_identifier_ai_ok", "eventName": "ai_action_succeeded", "occurredAt": datetime.now(timezone.utc).isoformat(), "properties": {"actionId": "analysis", "durationMs": 12}},
        {"eventId": "event_identifier_ai_fail", "eventName": "ai_action_failed", "occurredAt": datetime.now(timezone.utc).isoformat(), "properties": {"actionId": "ask", "durationMs": 12, "failureCode": "network"}},
        {"eventId": "event_identifier_capture_fail", "eventName": "receipt_capture_failed", "occurredAt": datetime.now(timezone.utc).isoformat(), "properties": {"source": "qr", "durationMs": 4, "failureCode": "validation"}},
        {"eventId": "event_identifier_checkout", "eventName": "subscription_checkout_opened", "occurredAt": datetime.now(timezone.utc).isoformat(), "properties": {"plan": "premium_monthly"}},
    ]
    assert (await client.post("/api/product-analytics/events", json=body)).json() == {"accepted": True, "inserted": 5}
    rows = (await async_session.scalars(select(AnalyticsEvent).order_by(AnalyticsEvent.idempotency_id))).all()
    assert {row.idempotency_id: row.properties for row in rows} == {
        "event_identifier_ai_fail": {"actionId": "ask", "durationMs": 12, "failureCode": "network"},
        "event_identifier_ai_ok": {"actionId": "analysis", "durationMs": 12},
        "event_identifier_capture_fail": {"source": "qr", "durationMs": 4, "failureCode": "validation"},
        "event_identifier_checkout": {"plan": "premium_monthly"},
        "event_identifier_tab": {"tab": "assistant"},
    }
    for zone in ("Etc/GMT+5", "America/Argentina/Buenos_Aires"):
        timezone_body = _body(event_id=f"event_identifier_{zone.replace('/', '_').replace('+', '_')}")
        timezone_body["timezone"] = zone
        assert (await client.post("/api/product-analytics/events", json=timezone_body)).status_code == 200


@pytest.mark.asyncio
async def test_guest_and_account_opt_out_anonymize_history_and_reenable_only_new_events(
    client, async_session, auth_headers, test_user
):
    body = _body(event_id="event_identifier_guest")
    await client.post("/api/product-analytics/events", json=body)
    disabled = await client.put("/api/product-analytics/preference", json={"installationId": body["installationId"], "enabled": False})
    assert disabled.json() == {"enabled": False}
    event = await async_session.scalar(select(AnalyticsEvent).where(AnalyticsEvent.idempotency_id == "event_identifier_guest"))
    assert event is not None and event.installation_id is None

    authenticated = _body(event_id="event_identifier_account")
    authenticated["installationId"] = "installation_identifier_account_2"
    await client.post("/api/product-analytics/events", headers=auth_headers, json=authenticated)
    await client.put("/api/product-analytics/preference", headers=auth_headers, json={"installationId": authenticated["installationId"], "enabled": False})
    historical = await async_session.scalar(select(AnalyticsEvent).where(AnalyticsEvent.idempotency_id == "event_identifier_account"))
    assert historical is not None and historical.user_id is None and historical.installation_id is None
    assert not test_user.analytics_enabled

    guest_reenable = await client.put(
        "/api/product-analytics/preference",
        json={"installationId": authenticated["installationId"], "enabled": True},
    )
    assert guest_reenable.json() == {"enabled": False}
    guest_bypass = _body(event_id="event_identifier_guest_account_bypass")
    guest_bypass["installationId"] = authenticated["installationId"]
    assert (await client.post("/api/product-analytics/events", json=guest_bypass)).json() == {
        "accepted": False,
        "inserted": 0,
    }
    assert await async_session.scalar(
        select(AnalyticsEvent.id).where(
            AnalyticsEvent.idempotency_id == "event_identifier_guest_account_bypass"
        )
    ) is None

    bypass = _body(event_id="event_identifier_bypass")
    bypass["installationId"] = "installation_identifier_new_2"
    assert (await client.post("/api/product-analytics/events", headers=auth_headers, json=bypass)).json()["accepted"] is False
    assert await async_session.scalar(
        select(AnalyticsEvent.id).where(AnalyticsEvent.idempotency_id == "event_identifier_bypass")
    ) is None
    assert len((await async_session.scalars(select(AnalyticsInstallation))).all()) == 2
    await client.put("/api/product-analytics/preference", headers=auth_headers, json={"installationId": authenticated["installationId"], "enabled": True})
    future = _body(event_id="event_identifier_future")
    future["installationId"] = authenticated["installationId"]
    response = await client.post("/api/product-analytics/events", headers=auth_headers, json=future)
    assert response.json() == {"accepted": True, "inserted": 1}
    assert historical.user_id is None and historical.installation_id is None
    assert (await async_session.scalar(select(User.analytics_enabled).where(User.id == test_user.id))) is True
