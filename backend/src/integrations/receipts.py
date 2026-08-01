"""Adapter for the external receipt-recognition provider."""

from __future__ import annotations

import io
from typing import Any

from aiohttp import (
    ClientError,
    ClientTimeout,
    ContentTypeError,
    FormData,
)

from src.config import API_KEY_QR, API_URL, QR_API_TIMEOUT_SECONDS
from src.integrations.http import get_http_session


class ReceiptProviderError(RuntimeError):
    """The receipt provider could not return a valid result."""


class ReceiptGateway:
    async def recognize_raw(self, qr_raw: str) -> dict[str, Any]:
        return await self._post(
            data={
                "qrraw": qr_raw,
                "token": API_KEY_QR,
            }
        )

    async def recognize_image(
        self,
        contents: bytes,
        *,
        filename: str,
        content_type: str,
    ) -> dict[str, Any]:
        data = FormData()
        data.add_field("token", API_KEY_QR)
        data.add_field(
            "qrfile",
            io.BytesIO(contents),
            filename=filename,
            content_type=content_type,
        )
        return await self._post(data=data)

    async def _post(self, *, data: Any) -> dict[str, Any]:
        timeout = ClientTimeout(total=QR_API_TIMEOUT_SECONDS)
        session = await get_http_session()
        try:
            async with session.post(API_URL, data=data, timeout=timeout) as response:
                if not response.ok:
                    raise ReceiptProviderError("Receipt provider rejected the request")
                payload = await response.json()
        except (ClientError, ContentTypeError, TimeoutError, ValueError) as exc:
            raise ReceiptProviderError("Receipt provider request failed") from exc
        if not isinstance(payload, dict):
            raise ReceiptProviderError("Receipt provider returned invalid data")
        return payload


receipt_gateway = ReceiptGateway()


def get_receipt_gateway() -> ReceiptGateway:
    return receipt_gateway
