"""Structured AI adapter for ambiguous receipt-item categories."""

from __future__ import annotations

import json
import re
from typing import Any

from aiohttp import ClientError, ClientTimeout, ContentTypeError

from src.config import AI_API_KEY, AI_BASE_URL, AI_LIGHT_MODEL, AI_TIMEOUT_SECONDS
from src.integrations.http import get_http_session
from src.product_categories import CANONICAL_CATEGORIES


class ProductClassifierError(RuntimeError):
    """The classifier could not return a validated canonical category."""


async def classify_product_category(raw_name: str, gtin: str | None = None) -> dict[str, Any]:
    categories = ", ".join(sorted(CANONICAL_CATEGORIES))
    system_prompt = (
        "Ты классифицируешь одну товарную позицию из российского кассового чека. "
        f"Допустимые категории: {categories}. "
        "Верни только JSON-объект с полями category и confidence. "
        "category должна точно совпадать с одной допустимой категорией, "
        "confidence должна быть числом от 0 до 1. Не угадывай бренд или состав."
    )
    body = {
        "is_sync": True,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": json.dumps({"name": raw_name, "gtin": gtin}, ensure_ascii=False),
            },
        ],
        "max_tokens": 100,
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {AI_API_KEY}",
    }
    session = await get_http_session()
    timeout = ClientTimeout(total=AI_TIMEOUT_SECONDS)
    try:
        async with session.post(
            AI_BASE_URL + AI_LIGHT_MODEL,
            json=body,
            headers=headers,
            timeout=timeout,
        ) as response:
            if not response.ok:
                raise ProductClassifierError("Product classifier rejected the request")
            provider_payload = await response.json()
    except (ClientError, ContentTypeError, TimeoutError, ValueError) as exc:
        raise ProductClassifierError("Product classifier request failed") from exc

    try:
        raw = provider_payload["response"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProductClassifierError("Product classifier returned invalid data") from exc
    if not isinstance(raw, str):
        raise ProductClassifierError("Product classifier returned invalid data")
    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProductClassifierError("Product classifier returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise ProductClassifierError("Product classifier returned invalid data")
    category = payload.get("category")
    confidence = payload.get("confidence")
    if (
        not isinstance(category, str)
        or category not in CANONICAL_CATEGORIES
        or isinstance(confidence, bool)
        or not isinstance(confidence, int | float)
        or not 0 <= float(confidence) <= 1
    ):
        raise ProductClassifierError("Product classifier returned invalid data")
    return {"category": category, "confidence": float(confidence)}
