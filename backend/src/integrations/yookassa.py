from __future__ import annotations

import asyncio
from typing import Any

from yookassa import Configuration, Payment
from yookassa.domain.exceptions import ApiError

from src.config import (
    PAYMENT_ACCOUNT_ID,
    PAYMENT_MAX_ATTEMPTS,
    PAYMENT_TIMEOUT_SECONDS,
    PAYMENT_SECRET_KEY,
)


class YooKassaError(RuntimeError):
    """YooKassa could not complete a request."""


class YooKassaGateway:
    def __init__(self) -> None:
        Configuration.account_id = PAYMENT_ACCOUNT_ID
        Configuration.secret_key = PAYMENT_SECRET_KEY
        Configuration.timeout = PAYMENT_TIMEOUT_SECONDS
        Configuration.max_attempts = PAYMENT_MAX_ATTEMPTS

    async def create_payment(self, payment_data: dict[str, Any], idempotency_key: str) -> Any:
        return await self._call(Payment.create, payment_data, idempotency_key)

    async def get_payment(self, payment_id: str) -> Any:
        return await self._call(Payment.find_one, payment_id)

    async def cancel_payment(self, payment_id: str, idempotency_key: str) -> Any:
        return await self._call(Payment.cancel, payment_id, idempotency_key)

    async def _call(self, operation, *args) -> Any:
        try:
            async with asyncio.timeout(PAYMENT_TIMEOUT_SECONDS + 1):
                return await asyncio.to_thread(operation, *args)
        except (ApiError, TimeoutError, OSError, ValueError) as exc:
            raise YooKassaError("YooKassa request failed") from exc


yookassa_gateway = YooKassaGateway()
