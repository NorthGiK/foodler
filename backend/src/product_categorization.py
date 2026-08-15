"""Receipt category pipeline.

This module deliberately has no dependency on nutrition generation.  A receipt
can therefore be saved when the catalogue or the model is unavailable.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from dataclasses import dataclass
from typing import Any

from aiohttp import ClientError, ClientTimeout, ContentTypeError
from sqlalchemy import func, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import AI_API_KEY, AI_BASE_URL, AI_STRONG_MODEL, OPEN_FOOD_FACTS_USER_AGENT
from src.integrations.http import get_http_session
from src.models import Product, ProductAlias, ProductBarcode, ProductCategoryAssignment
from src.product_categories import (
    CANONICAL_CATEGORIES,
    infer_category_from_name,
    normalize_category,
)
from src.product_names import normalize_name

TAXONOMY_VERSION = "v1"
CONFIRMED_CONFIDENCE = 0.8
_off_lock = asyncio.Lock()
_off_last_request = 0.0


@dataclass(frozen=True)
class CategoryDecision:
    category: str = "прочее"
    source: str = "fallback"
    confidence: float = 0.0
    taxonomy_version: str = TAXONOMY_VERSION
    model_version: str | None = None


def is_valid_gtin(value: str | None) -> bool:
    if not value or not value.isascii() or not value.isdigit() or len(value) not in {8, 12, 13, 14}:
        return False
    digits = [int(digit) for digit in value]
    expected = sum(
        digit * (3 if index % 2 == 0 else 1) for index, digit in enumerate(reversed(digits[:-1]))
    )
    return (10 - expected % 10) % 10 == digits[-1]


def is_restricted_gtin(gtin: str | None) -> bool:
    return bool(gtin and len(gtin) >= 2 and gtin[:2] in {str(n) for n in range(20, 30)})


def extract_gtin(value: Any, *, _code_value: bool = True) -> str | None:
    """Recursively find an EAN/GS1 value without coercing away leading zeroes.

    Container traversal is deliberately broad for future provider wrappers, but
    scalar values are accepted only below barcode-shaped keys.  This prevents a
    valid-looking fiscal document number elsewhere in an item from becoming a
    product GTIN.
    """
    if isinstance(value, dict):
        for key, child in value.items():
            normalized_key = re.sub(r"[^a-z0-9]", "", key.lower())
            is_code_key = normalized_key in {"code", "productcode", "productcodenew"} or any(
                token in normalized_key for token in ("gtin", "ean", "gs1", "barcode")
            )
            found = extract_gtin(child, _code_value=is_code_key)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = extract_gtin(child, _code_value=_code_value)
            if found:
                return found
    elif _code_value and isinstance(value, str) and is_valid_gtin(value):
        return value
    return None


def merchant_fingerprint(identity: str | None) -> str:
    normalized = normalize_name(identity or "")
    return hashlib.sha256(normalized.encode()).hexdigest() if normalized else ""


def assignment_key(name: str, gtin: str | None, merchant: str | None) -> tuple[str, str, str]:
    if gtin and is_valid_gtin(gtin):
        if is_restricted_gtin(gtin):
            scope = merchant_fingerprint(merchant)
            return ("merchant_code", gtin, scope) if scope else ("restricted_unscoped", gtin, "")
        return "gtin", gtin, ""
    return "name", normalize_name(name), ""


async def _off_candidates(gtin: str) -> list[str]:
    """Return a few OFF category hints; never persist the raw provider payload."""
    global _off_last_request
    try:
        async with asyncio.timeout(3):
            async with _off_lock:
                delay = 1.0 - (time.monotonic() - _off_last_request)
                if delay > 0:
                    await asyncio.sleep(delay)
                _off_last_request = time.monotonic()
            session = await get_http_session()
            async with session.get(
                f"https://world.openfoodfacts.org/api/v3/product/{gtin}",
                params={"product_type": "all", "fields": "categories_tags,categories"},
                headers={"User-Agent": OPEN_FOOD_FACTS_USER_AGENT},
                timeout=ClientTimeout(total=3),
            ) as response:
                if response.status != 200:
                    return []
                payload = await response.json()
    except (ClientError, ContentTypeError, OSError, RuntimeError, TimeoutError, ValueError):
        return []
    product = payload.get("product") if isinstance(payload, dict) else None
    values = (
        product.get("categories_tags", product.get("categories", []))
        if isinstance(product, dict)
        else []
    )
    if isinstance(values, str):
        values = values.split(",")
    if not isinstance(values, list):
        return []
    # OFF's multilingual tags are hints, not Foodler taxonomy values. Mapping
    # them locally keeps the structured AI enum bounded.
    english = {
        "dairy": "молочные",
        "cheese": "молочные",
        "fruit": "фрукты",
        "vegetable": "овощи",
        "rice": "бакалея",
        "cereal": "бакалея",
        "snack": "снеки",
        "alcohol": "алкоголь",
        "beer": "алкоголь",
        "egg": "яйца",
        "ready meal": "готовая еда",
    }
    mapped = []
    for value in values:
        text = str(value).lower().replace("en:", "").replace("-", " ")
        mapped.append(
            next((category for token, category in english.items() if token in text), None)
            or infer_category_from_name(text)
        )
    return list(dict.fromkeys(value for value in mapped if value))[:5]


async def _classify_batch(items: list[dict[str, Any]]) -> dict[str, CategoryDecision]:
    if not items or not AI_API_KEY or not AI_STRONG_MODEL:
        return {}
    categories = sorted(CANONICAL_CATEGORIES)
    body = {
        "is_sync": True,
        "temperature": 0,
        "messages": [
            {
                "role": "system",
                "content": "Classify receipt items. Return only JSON {items:[{key,category,confidence}]}. category must be one of: "
                + ", ".join(categories),
            },
            {"role": "user", "content": json.dumps(items, ensure_ascii=False)},
        ],
        "max_tokens": max(160, len(items) * 45),
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "receipt_categories",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["items"],
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": ["key", "category", "confidence"],
                                "properties": {
                                    "key": {"type": "string"},
                                    "category": {"type": "string", "enum": categories},
                                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                                },
                            },
                        }
                    },
                },
            },
        },
    }
    try:
        async with asyncio.timeout(3):
            session = await get_http_session()
            async with session.post(
                AI_BASE_URL + AI_STRONG_MODEL,
                json=body,
                headers={
                    "Authorization": f"Bearer {AI_API_KEY}",
                    "Content-Type": "application/json",
                },
                # Categorization is best-effort during receipt persistence; it
                # must not make the receipt scan wait behind an unavailable model.
                timeout=ClientTimeout(total=3),
            ) as response:
                if not response.ok:
                    return {}
                payload = await response.json()
        raw = payload["response"][0]["message"]["content"]
        if not isinstance(raw, str):
            return {}
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, re.S)
        data = json.loads(match.group(1) if match else raw)
        rows = data.get("items", []) if isinstance(data, dict) else []
    except (
        ClientError,
        ContentTypeError,
        TimeoutError,
        ValueError,
        KeyError,
        IndexError,
        RuntimeError,
        TypeError,
    ):
        return {}
    decisions: dict[str, CategoryDecision] = {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("key"), str):
            continue
        confidence = row.get("confidence")
        category = row.get("category")
        if (
            isinstance(confidence, bool)
            or not isinstance(confidence, (int, float))
            or not 0 <= confidence <= 1
            or not isinstance(category, str)
        ):
            continue
        normalized = normalize_category(category)
        if normalized in CANONICAL_CATEGORIES and (
            normalized != "прочее" or category.strip().lower() == "прочее"
        ):
            decisions[row["key"]] = CategoryDecision(
                normalized, "ai", float(confidence), model_version=AI_STRONG_MODEL
            )
    return decisions


async def _cached(db: AsyncSession, key_type: str, key: str, scope: str) -> CategoryDecision | None:
    row = await db.scalar(
        select(ProductCategoryAssignment).where(
            ProductCategoryAssignment.key_type == key_type,
            ProductCategoryAssignment.lookup_key == key,
            ProductCategoryAssignment.merchant_scope == scope,
            ProductCategoryAssignment.status == "confirmed",
        )
    )
    if row and row.confidence >= CONFIRMED_CONFIDENCE:
        return CategoryDecision(
            row.category, row.source, row.confidence, row.taxonomy_version, row.model_version
        )
    return None


async def _upsert(
    db: AsyncSession, key_type: str, key: str, scope: str, decision: CategoryDecision
) -> None:
    if decision.confidence < CONFIRMED_CONFIDENCE or not key or key_type == "restricted_unscoped":
        return
    statement = insert(ProductCategoryAssignment).values(
        key_type=key_type,
        lookup_key=key,
        merchant_scope=scope,
        category=decision.category,
        source=decision.source,
        confidence=decision.confidence,
        taxonomy_version=decision.taxonomy_version,
        model_version=decision.model_version,
        status="confirmed",
    )
    statement = statement.on_conflict_do_update(
        index_elements=["key_type", "lookup_key", "merchant_scope"],
        set_={
            "category": statement.excluded.category,
            "source": statement.excluded.source,
            "confidence": statement.excluded.confidence,
            "taxonomy_version": statement.excluded.taxonomy_version,
            "model_version": statement.excluded.model_version,
            "status": "confirmed",
            "updated_at": func.current_timestamp(),
        },
    )
    await db.execute(statement)


async def categorize_items(
    db: AsyncSession, items: list[dict[str, Any]], merchant: str | None = None
) -> list[CategoryDecision]:
    """Classify distinct positions once; all failures degrade to ``прочее``."""
    unique: dict[tuple[str, str, str], dict[str, Any]] = {}
    for item in items:
        name = str(item.get("name") or "")
        gtin = item.get("gtin") if isinstance(item.get("gtin"), str) else None
        key = assignment_key(name, gtin, merchant)
        unique.setdefault(key, {"name": name, "gtin": gtin, "key": "|".join(key)})
    decisions: dict[tuple[str, str, str], CategoryDecision] = {}
    unknown: list[dict[str, Any]] = []
    for identity, item in unique.items():
        cached = await _cached(db, *identity)
        if cached:
            decisions[identity] = cached
            continue
        products: list[Product] = []
        if item["gtin"] and is_valid_gtin(item["gtin"]) and not is_restricted_gtin(item["gtin"]):
            barcode = await db.get(ProductBarcode, item["gtin"])
            if barcode:
                product = await db.get(Product, barcode.product_id)
                if product:
                    # A global barcode is an explicit product identity and
                    # takes precedence over disagreeing legacy aliases.
                    decision = CategoryDecision(
                        normalize_category(product.category), "gtin", 1.0
                    )
                    decisions[identity] = decision
                    await _upsert(db, *identity, decision)
                    continue
        normalized_name = normalize_name(item["name"])
        products.extend(
            (
                await db.scalars(select(Product).where(Product.normalized_name == normalized_name))
            ).all()
        )
        aliases = (
            await db.scalars(select(ProductAlias).where(ProductAlias.alias == normalized_name))
        ).all()
        for alias in aliases:
            product = await db.get(Product, alias.product_id)
            if product:
                products.append(product)
        products = list({product.id: product for product in products}.values())
        # Conflicting legacy aliases/names go to the classifier; first-row
        # selection would make results nondeterministic.
        if len(products) == 1:
            decision = CategoryDecision(
                normalize_category(products[0].category), "product", 1.0
            )
            decisions[identity] = decision
            await _upsert(db, *identity, decision)
            continue
        local = infer_category_from_name(item["name"])
        conflict_categories = [normalize_category(product.category) for product in products]
        likely = list(
            dict.fromkeys(
                candidate
                for candidate in [local, *conflict_categories]
                if candidate and candidate != "прочее"
            )
        )[:5]
        item["candidates"] = [*likely, "прочее"]
        unknown.append(item)
    off_items = [
        item
        for item in unknown
        if item["gtin"] and is_valid_gtin(item["gtin"]) and not is_restricted_gtin(item["gtin"])
    ]
    off_hints = await asyncio.gather(
        *(_off_candidates(item["gtin"]) for item in off_items), return_exceptions=True
    )
    for item, hints in zip(off_items, off_hints, strict=True):
        if isinstance(hints, list):
            likely = [
                candidate
                for candidate in [*item["candidates"][:-1], *hints]
                if candidate != "прочее"
            ]
            item["candidates"] = [*list(dict.fromkeys(likely))[:5], "прочее"]
    ai = await _classify_batch(unknown) if unknown else {}
    for identity, item in unique.items():
        if identity in decisions:
            continue
        decision = ai.get(item["key"])
        if decision is None:
            # Local and catalogue rules are candidate generators only.  When
            # the final classifier is unavailable, persistence continues with
            # an explicit non-canonical fallback rather than promoting a hint.
            decision = CategoryDecision()
        decisions[identity] = decision
        await _upsert(db, *identity, decision)
    return [
        decisions[
            assignment_key(
                str(item.get("name") or ""),
                item.get("gtin") if isinstance(item.get("gtin"), str) else None,
                merchant,
            )
        ]
        for item in items
    ]
