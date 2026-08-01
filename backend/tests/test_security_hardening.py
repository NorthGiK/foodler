from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import select, text
from starlette.requests import Request
from starlette.responses import Response

from src.auth import hash_email_code, hash_refresh_token
from src.models import EmailCodesStorage, RefreshToken
from src.utils import DatabaseRateLimiter


@pytest.mark.asyncio
async def test_email_code_and_refresh_token_are_not_stored_in_plaintext(
    client: AsyncClient,
    async_session,
    test_user,
    monkeypatch,
):
    send = AsyncMock(return_value=True)
    monkeypatch.setattr("src.routers.auth.EmailService.send_code", send)
    response = await client.post(
        "/api/auth/send-code",
        json={"email": "new@example.com", "password": "StrongPass123"},  # pragma: allowlist secret
    )
    assert response.status_code == 200
    sent_code = send.await_args.args[1]
    stored_code = await async_session.scalar(
        select(EmailCodesStorage).where(EmailCodesStorage.email == "new@example.com")
    )
    assert stored_code.code_hash == hash_email_code("new@example.com", sent_code)
    assert sent_code not in stored_code.code_hash

    login = await client.post(
        "/api/auth/login",
        json={
            "email": test_user.email,
            "password": "TestPass123!",  # pragma: allowlist secret
        },
    )
    raw_refresh = login.json()["refreshToken"]
    stored_refresh = await async_session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
    )
    assert stored_refresh is not None
    assert raw_refresh not in stored_refresh.token_hash


@pytest.mark.asyncio
async def test_auth_version_revokes_existing_access_token(
    client: AsyncClient,
    auth_headers,
    async_session,
    test_user,
):
    test_user.auth_version += 1
    await async_session.commit()
    response = await client.get("/api/users/me", headers=auth_headers)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_provider_and_internal_operations_require_authentication(
    client: AsyncClient,
):
    qr = await client.post(
        "/api/receipts/get_receipt_by_qr",
        json={"qrraw": "safe-test-value"},
    )
    feedback = await client.post(
        "/api/users/send-feedback",
        json={"email": "fixture@example.com", "text": "hello", "images": []},
    )
    cleanup = await client.post("/api/receipts/cleanup")
    assert qr.status_code == 401
    assert feedback.status_code == 401
    assert cleanup.status_code == 405


@pytest.mark.asyncio
async def test_cors_does_not_reflect_untrusted_origin(client: AsyncClient):
    response = await client.options(
        "/api/users/me",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.asyncio
async def test_metrics_are_hidden_and_require_a_separate_token(
    client: AsyncClient,
    monkeypatch,
):
    disabled = await client.get("/metrics")
    assert disabled.status_code == 404

    monkeypatch.setattr("src.main.METRICS_TOKEN", "metrics-test-token")
    unauthorized = await client.get("/metrics")
    authorized = await client.get(
        "/metrics",
        headers={"Authorization": "Bearer metrics-test-token"},
    )
    assert unauthorized.status_code == 401
    assert authorized.status_code == 200
    assert "foodler_http_requests_total" in authorized.text


@pytest.mark.asyncio
async def test_database_rate_limiter_is_shared_through_persisted_bucket(async_session):
    limiter = DatabaseRateLimiter(2, 60)
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/limited",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "scheme": "http",
        "server": ("test", 80),
        "query_string": b"",
        "root_path": "",
        "http_version": "1.1",
    }
    request = Request(scope)
    first_response = Response()
    second_response = Response()
    await limiter(request, first_response, async_session)
    await limiter(request, second_response, async_session)
    assert first_response.headers["X-RateLimit-Remaining"] == "1"
    assert second_response.headers["X-RateLimit-Remaining"] == "0"
    with pytest.raises(HTTPException) as exc_info:
        await limiter(request, Response(), async_session)
    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_money_is_stored_in_integer_minor_units(async_session, test_receipt):
    stored_total = await async_session.scalar(
        text("SELECT total_cents FROM receipts WHERE id = :receipt_id").bindparams(
            receipt_id=test_receipt.id
        )
    )
    stored_price = await async_session.scalar(
        text(
            "SELECT price_cents FROM receipt_items WHERE receipt_id = :receipt_id LIMIT 1"
        ).bindparams(receipt_id=test_receipt.id)
    )
    assert isinstance(stored_total, int)
    assert isinstance(stored_price, int)
