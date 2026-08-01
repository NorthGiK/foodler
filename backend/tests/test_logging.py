import json
import logging

import pytest
from httpx import AsyncClient

from src.logging_config import JsonFormatter, request_id_context


def test_json_formatter_includes_request_id_and_drops_sensitive_extras():
    token = request_id_context.set("request-123")
    try:
        record = logging.LogRecord(
            name="foodler.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="Completed",
            args=(),
            exc_info=None,
        )
        record.status_code = 200
        record.email = "private@example.com"
        record.token = "secret-token"
        record.body = {"qrraw": "sensitive"}

        document = json.loads(JsonFormatter().format(record))
    finally:
        request_id_context.reset(token)

    assert document["request_id"] == "request-123"
    assert document["status_code"] == 200
    serialized = json.dumps(document)
    assert "private@example.com" not in serialized
    assert "secret-token" not in serialized
    assert "qrraw" not in serialized


@pytest.mark.asyncio
async def test_request_id_is_returned_and_untrusted_value_is_replaced(
    client: AsyncClient,
):
    accepted = await client.get("/health", headers={"X-Request-ID": "mobile-request-1"})
    rejected = await client.get("/health", headers={"X-Request-ID": "not valid/and too revealing"})

    assert accepted.headers["X-Request-ID"] == "mobile-request-1"
    assert rejected.headers["X-Request-ID"] != "not valid/and too revealing"
    assert len(rejected.headers["X-Request-ID"]) == 32
