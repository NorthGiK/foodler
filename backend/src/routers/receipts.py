import hashlib
import logging
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.config import (
    QR_UPLOAD_MAX_BYTES,
    RECEIPT_PAGE_SIZE_MAX,
)
from src.utils import DatabaseRateLimiter, with_rate_limit

from ..auth import get_current_user, get_current_user_optional_from_request
from ..database import get_db
from ..integrations.receipts import (
    ReceiptGateway,
    ReceiptProviderError,
    get_receipt_gateway,
)
from ..models import Product, ProductAlias, ProductBarcode, Receipt, ReceiptItem, User
from ..product_categories import normalize_category
from ..product_categorization import categorize_items, extract_gtin
from ..product_matching import normalize_name
from ..receipt_retention import compute_receipt_expiry
from ..schemas import (
    GetReceiptFromQRSchema,
    ReceiptCreateArraySchema,
    ReceiptCreateSchema,
    ReceiptItemSchema,
    ReceiptRawResponseSchema,
    ReceiptResponseSchema,
    ReceiptUpdateSchema,
    StatusResponse,
)
from ..services.entitlements import get_entitlement

router = APIRouter(tags=["Receipts"])
legacy_router = APIRouter(tags=["Receipts"])
get = with_rate_limit(router.get, DatabaseRateLimiter(100, 1))
post = with_rate_limit(router.post, DatabaseRateLimiter(100, 1))
legacy_post = with_rate_limit(legacy_router.post, DatabaseRateLimiter(100, 1))
delete = with_rate_limit(router.delete, DatabaseRateLimiter(50, 1))
patch = with_rate_limit(router.patch, DatabaseRateLimiter(50, 1))

logger = logging.getLogger(__name__)


def _source_fingerprint(source_key: str | None) -> str | None:
    if not source_key:
        return None
    normalized = "&".join(
        sorted(part.strip().lower() for part in source_key.split("&") if part.strip())
    )
    return hashlib.sha256(normalized.encode()).hexdigest() if normalized else None


def _item_schema(item: ReceiptItem) -> ReceiptItemSchema:
    item_sum = round(float(item.price) * item.quantity, 2)
    return ReceiptItemSchema(
        name=item.name,
        quantity=item.quantity,
        unit=item.unit,
        price=item.price,
        sum=item_sum,
        product_id=item.product_id,
        gtin=item.gtin,
        category=normalize_category(item.category),
        category_source=item.category_source,
        category_confidence=item.category_confidence,
        category_taxonomy_version=item.category_taxonomy_version,
        category_model_version=item.category_model_version,
    )


def _add_category_snapshot(raw_item: dict[str, Any], item: ReceiptItem) -> None:
    raw_item["gtin"] = item.gtin
    raw_item["category"] = item.category
    raw_item["category_source"] = item.category_source
    raw_item["category_confidence"] = item.category_confidence
    raw_item["category_taxonomy_version"] = item.category_taxonomy_version
    raw_item["category_model_version"] = item.category_model_version


def _item_identity(item: ReceiptItemSchema | ReceiptItem) -> tuple[str, int, float]:
    return (
        normalize_name(item.name),
        round(float(item.price) * 100),
        round(float(item.quantity), 6),
    )


def _enrich_raw_items(raw_data: dict[str, Any], stored_items: list[ReceiptItem]) -> None:
    raw_items = raw_data.get("items")
    if not isinstance(raw_items, list):
        return
    stored_by_identity: dict[tuple[str, int, float], list[ReceiptItem]] = {}
    for item in stored_items:
        stored_by_identity.setdefault(_item_identity(item), []).append(item)
    for raw_item in raw_items:
        body = _provider_item_schema(raw_item)
        if body is None:
            continue
        matches = stored_by_identity.get(_item_identity(body))
        if matches:
            _add_category_snapshot(raw_item, matches.pop())


async def _receipt_item(body: ReceiptItemSchema, receipt_id: str, decision: Any) -> ReceiptItem:
    return ReceiptItem(
        receipt_id=receipt_id,
        name=body.name,
        quantity=body.quantity,
        unit=body.unit,
        price=body.price,
        product_id=body.product_id,
        gtin=body.gtin,
        category=decision.category,
        category_source=decision.source,
        category_confidence=decision.confidence,
        category_taxonomy_version=decision.taxonomy_version,
        category_model_version=decision.model_version,
    )


async def _receipt_items(
    bodies: list[ReceiptItemSchema], receipt_id: str, db: AsyncSession, merchant: str | None
) -> list[ReceiptItem]:
    decisions = await categorize_items(
        db, [{"name": body.name, "gtin": body.gtin} for body in bodies], merchant
    )
    # Preserve a known product relation for analytics, but only when the exact
    # key is unambiguous; categorization itself never makes this arbitrary.
    for body in bodies:
        if body.product_id:
            continue
        if body.gtin:
            barcode = await db.get(ProductBarcode, body.gtin)
            if barcode:
                body.product_id = barcode.product_id
                continue
        products = (
            await db.scalars(
                select(Product).where(Product.normalized_name == normalize_name(body.name))
            )
        ).all()
        aliases = (
            await db.scalars(select(ProductAlias).where(ProductAlias.alias == normalize_name(body.name)))
        ).all()
        for alias in aliases:
            product = await db.get(Product, alias.product_id)
            if product:
                products.append(product)
        products = list({product.id: product for product in products}.values())
        if len(products) == 1:
            body.product_id = products[0].id
    return [
        await _receipt_item(body, receipt_id, decision)
        for body, decision in zip(bodies, decisions, strict=True)
    ]


@post("/receipts/get_receipt_by_qr", response_model=ReceiptRawResponseSchema)
async def get_receipt_by_qr(
    body: GetReceiptFromQRSchema,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    gateway: ReceiptGateway = Depends(get_receipt_gateway),
):
    try:
        result = ReceiptRawResponseSchema.model_validate(await gateway.recognize_raw(body.qrraw))
        result.receiptId = await _save_recognized_receipt(result, user, db)
        return result
    except ReceiptProviderError as exc:
        logger.warning("Receipt provider request failed", extra={"provider": "receipt_api"})
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Receipt provider unavailable",
        ) from exc


async def _save_recognized_receipt(
    result: ReceiptRawResponseSchema,
    user: User,
    db: AsyncSession,
) -> str | None:
    if result.code != 1 or result.data is None:
        return None

    raw_data = result.data.get("json")
    if not isinstance(raw_data, dict):
        return None

    ticket_date = raw_data.get("ticketDate")
    if not isinstance(ticket_date, str):
        ticket_date = raw_data.get("dateTime")
    total_sum = raw_data.get("totalSum")
    if not isinstance(ticket_date, str) or isinstance(total_sum, bool):
        return None
    try:
        receipt_date = date.fromisoformat(ticket_date[:10])
        total = Decimal(str(total_sum)) / 100
    except (ValueError, ArithmeticError):
        logger.warning("Recognized receipt had an invalid date")
        return None
    if total < 0:
        return None

    source_key = result.request.get("qrraw") if isinstance(result.request, dict) else None
    source_fingerprint = _source_fingerprint(source_key if isinstance(source_key, str) else None)
    filters = [Receipt.user_id == user.id]
    if source_fingerprint:
        filters.append(Receipt.source_fingerprint == source_fingerprint)
    else:
        filters.extend((Receipt.date == receipt_date, Receipt.total == total))
    stmt = select(Receipt).where(*filters).options(selectinload(Receipt.items))
    existing_receipt = (await db.execute(stmt)).scalar_one_or_none()
    if existing_receipt is not None:
        _enrich_raw_items(raw_data, list(existing_receipt.items))
        return existing_receipt.id

    entitlement = await get_entitlement(db, user)
    receipt = Receipt(
        id=uuid4().hex,
        date=receipt_date,
        store=_optional_text(raw_data.get("user")),
        total=total,
        user_id=user.id,
        receipt_expires_at=compute_receipt_expiry(entitlement.active),
        source_fingerprint=source_fingerprint,
    )
    db.add(receipt)
    raw_items = raw_data.get("items")
    pairs = (
        [(item, _provider_item_schema(item)) for item in raw_items if isinstance(item, dict)]
        if isinstance(raw_items, list)
        else []
    )
    valid_pairs = [(item, body) for item, body in pairs if body is not None]
    stored_items = await _receipt_items(
        [body for _, body in valid_pairs], receipt.id, db, receipt.store
    )
    for (raw_item, _), receipt_item in zip(valid_pairs, stored_items, strict=True):
        _add_category_snapshot(raw_item, receipt_item)
        db.add(receipt_item)
    await db.commit()
    return receipt.id


def _optional_text(value: Any) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _gtin_from_provider(item: dict[str, Any]) -> str | None:
    return extract_gtin(item.get("productCodeNew") or item.get("productCode") or item)


def _provider_item_schema(item: Any) -> ReceiptItemSchema | None:
    if not isinstance(item, dict):
        return None
    name = item.get("name")
    price = item.get("price")
    quantity = item.get("quantity", 1)
    if (
        not isinstance(name, str)
        or not name.strip()
        or isinstance(price, bool)
        or isinstance(quantity, bool)
    ):
        return None
    try:
        normalized_price = Decimal(str(price)) / 100
        normalized_quantity = float(quantity)
    except (ArithmeticError, TypeError, ValueError):
        return None
    if normalized_price < 0 or normalized_quantity <= 0:
        return None
    return ReceiptItemSchema(
        name=name.strip(),
        quantity=normalized_quantity,
        unit="kg",
        price=normalized_price,
        gtin=_gtin_from_provider(item),
    )


async def _recognize_receipt_image(
    contents: bytes,
    qrfile: UploadFile,
    gateway: ReceiptGateway,
) -> ReceiptRawResponseSchema:
    try:
        return ReceiptRawResponseSchema.model_validate(
            await gateway.recognize_image(
                contents,
                filename=qrfile.filename or "receipt.jpg",
                content_type=qrfile.content_type or "image/jpeg",
            )
        )
    except ReceiptProviderError as exc:
        logger.warning("Receipt provider request failed", extra={"provider": "receipt_api"})
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Receipt provider unavailable",
        ) from exc


@post("/receipts/get_receipt_by_raw_qr", response_model=ReceiptRawResponseSchema)
async def get_receipt_by_raw_qr(
    qrfile: UploadFile,
    gateway: ReceiptGateway = Depends(get_receipt_gateway),
    user: User | None = Depends(get_current_user_optional_from_request),
    db: AsyncSession = Depends(get_db),
) -> ReceiptRawResponseSchema:
    contents = await qrfile.read(QR_UPLOAD_MAX_BYTES + 1)
    if len(contents) > QR_UPLOAD_MAX_BYTES:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            detail="QR image is too large",
        )

    result = await _recognize_receipt_image(contents, qrfile, gateway)
    if user is not None:
        result.receiptId = await _save_recognized_receipt(result, user, db)
    return result


@legacy_post("/receipts/get_receipt_by_raw_qr", response_model=ReceiptRawResponseSchema)
async def get_receipt_by_raw_qr_legacy(
    qrfile: UploadFile,
    gateway: ReceiptGateway = Depends(get_receipt_gateway),
    user: User | None = Depends(get_current_user_optional_from_request),
    db: AsyncSession = Depends(get_db),
) -> ReceiptRawResponseSchema:
    contents = await qrfile.read(QR_UPLOAD_MAX_BYTES + 1)
    if len(contents) > QR_UPLOAD_MAX_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="QR image is too large")
    result = await _recognize_receipt_image(contents, qrfile, gateway)
    if user is not None:
        result.receiptId = await _save_recognized_receipt(result, user, db)
    return result


@get("/receipts", response_model=list[ReceiptResponseSchema])
async def get_receipts(
    response: Response,
    from_date: str | None = None,
    to_date: str | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=RECEIPT_PAGE_SIZE_MAX),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [Receipt.user_id == user.id]
    if from_date:
        filters.append(Receipt.date >= from_date)
    if to_date:
        filters.append(Receipt.date <= to_date)

    total_count = await db.scalar(select(func.count()).select_from(Receipt).where(*filters))
    query = (
        select(Receipt)
        .where(*filters)
        .options(selectinload(Receipt.items).selectinload(ReceiptItem.product))
        .order_by(Receipt.date.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await db.execute(query)
    receipts = result.scalars().all()
    response.headers["X-Total-Count"] = str(total_count or 0)
    response.headers["X-Page-Offset"] = str(offset)
    response.headers["X-Page-Limit"] = str(limit)
    return [
        ReceiptResponseSchema(
            id=r.id,
            date=r.date,
            store=r.store,
            total=r.total,
            createdAt=r.created_at,
            items=[_item_schema(i) for i in (r.items or [])],
        )
        for r in receipts
    ]


@post(
    "/receipts",
    status_code=status.HTTP_201_CREATED,
    response_model=StatusResponse,
)
async def upload_receipt(
    body: ReceiptCreateSchema,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entitlement = await get_entitlement(db, user)
    source_fingerprint = _source_fingerprint(body.source_key)
    if source_fingerprint:
        existing_by_source = await db.scalar(
            select(Receipt).where(
                Receipt.user_id == user.id,
                Receipt.source_fingerprint == source_fingerprint,
            )
        )
        if existing_by_source:
            return {"status": "duplicate"}
    receipt = await db.get(Receipt, body.id)
    if receipt:
        if receipt.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Receipt identifier is already in use",
            )
        return Response()

    receipt = Receipt(
        id=body.id,
        date=body.date,
        store=body.store,
        total=body.total,
        user_id=user.id,
        receipt_expires_at=compute_receipt_expiry(entitlement.active),
        source_fingerprint=source_fingerprint,
    )
    db.add(receipt)

    for item in await _receipt_items(
        body.items, receipt.id, db, body.merchant_identity or body.store
    ):
        db.add(item)
    await db.commit()
    return {"status": "ok"}


@post(
    "/receipts/array",
    status_code=status.HTTP_201_CREATED,
    response_model=StatusResponse,
)
async def upload_receipts(
    body: ReceiptCreateArraySchema,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    receipt_bodies = body.receipts or []
    entitlement = await get_entitlement(db, user)
    requested_ids = [receipt.id for receipt in receipt_bodies]
    existing = set(
        (
            await db.scalars(
                select(Receipt.id).where(
                    Receipt.id.in_(requested_ids),
                    Receipt.user_id == user.id,
                )
            )
        ).all()
    )
    foreign_collision = await db.scalar(
        select(Receipt.id).where(
            Receipt.id.in_(requested_ids),
            Receipt.user_id != user.id,
        )
    )
    if foreign_collision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Receipt identifier is already in use",
        )
    requested_fingerprints = {
        fingerprint
        for receipt in receipt_bodies
        if (fingerprint := _source_fingerprint(receipt.source_key)) is not None
    }
    existing_fingerprints = set(
        (
            await db.scalars(
                select(Receipt.source_fingerprint).where(
                    Receipt.user_id == user.id,
                    Receipt.source_fingerprint.in_(requested_fingerprints),
                )
            )
        ).all()
    )
    seen_fingerprints = existing_fingerprints
    new_receipt_bodies: list[ReceiptCreateSchema] = []
    for receipt in receipt_bodies:
        fingerprint = _source_fingerprint(receipt.source_key)
        if receipt.id in existing or (fingerprint and fingerprint in seen_fingerprints):
            continue
        new_receipt_bodies.append(receipt)
        if fingerprint:
            seen_fingerprints.add(fingerprint)
    receipts = [
        Receipt(
            id=r.id,
            date=r.date,
            store=r.store,
            total=r.total,
            user_id=user.id,
            receipt_expires_at=compute_receipt_expiry(entitlement.active),
            source_fingerprint=_source_fingerprint(r.source_key),
        )
        for r in new_receipt_bodies
    ]

    for receipt in receipts:
        db.add(receipt)

    for receipt in new_receipt_bodies:
        for item in await _receipt_items(
            receipt.items, receipt.id, db, receipt.merchant_identity or receipt.store
        ):
            db.add(item)
    await db.commit()
    return {"status": "ok"}


@get("/receipts/{receipt_id}", response_model=ReceiptResponseSchema)
async def get_receipt(
    receipt_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Receipt)
        .where(Receipt.id == receipt_id, Receipt.user_id == user.id)
        .options(selectinload(Receipt.items).selectinload(ReceiptItem.product))
    )
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    return ReceiptResponseSchema(
        id=r.id,
        date=r.date,
        store=r.store,
        total=r.total,
        createdAt=r.created_at,
        items=[_item_schema(i) for i in (r.items or [])],
    )


@patch("/receipts/{receipt_id}", response_model=ReceiptResponseSchema)
async def update_receipt(
    receipt_id: str,
    body: ReceiptUpdateSchema,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Receipt)
        .where(Receipt.id == receipt_id, Receipt.user_id == user.id)
        .options(selectinload(Receipt.items))
    )
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")

    r.date = body.date
    r.store = body.store or "Продуктовый"
    r.total = body.total

    # Delete old items and add new ones
    for old_item in r.items:
        await db.delete(old_item)
    r.items.clear()

    for ri in await _receipt_items(body.items, r.id, db, body.merchant_identity or body.store):
        db.add(ri)

    await db.commit()

    # Re-fetch to get fresh items
    await db.refresh(r, ["items"])
    return ReceiptResponseSchema(
        id=r.id,
        date=r.date,
        store=r.store,
        total=r.total,
        createdAt=r.created_at,
        items=[_item_schema(i) for i in (r.items or [])],
    )


@delete("/receipts/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_receipt(
    receipt_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Receipt).where(Receipt.id == receipt_id, Receipt.user_id == user.id)
    )
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    await db.delete(r)
    await db.commit()
