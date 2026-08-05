import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.config import (
    QR_UPLOAD_MAX_BYTES,
    RECEIPT_PAGE_SIZE_MAX,
)
from src.utils import DatabaseRateLimiter, with_rate_limit

from ..auth import get_current_user
from ..database import get_db
from ..integrations.receipts import (
    ReceiptGateway,
    ReceiptProviderError,
    get_receipt_gateway,
)
from ..models import Receipt, ReceiptItem, User
from ..receipt_retention import compute_receipt_expiry
from ..schemas import (
    GetReceiptFromQRSchema,
    ReceiptItemSchema,
    ReceiptRawResponseSchema,
    ReceiptSchema,
    ReceiptSchemaArray,
    StatusResponse,
)
from ..services.entitlements import get_entitlement

router = APIRouter(tags=["Receipts"])
get = with_rate_limit(router.get, DatabaseRateLimiter(100, 1))
post = with_rate_limit(router.post, DatabaseRateLimiter(100, 1))
delete = with_rate_limit(router.delete, DatabaseRateLimiter(50, 1))
patch = with_rate_limit(router.patch, DatabaseRateLimiter(50, 1))

logger = logging.getLogger(__name__)


@post("/receipts/get_receipt_by_qr", response_model=ReceiptRawResponseSchema)
async def get_receipt_by_qr(
    body: GetReceiptFromQRSchema,
    user: User = Depends(get_current_user),
    gateway: ReceiptGateway = Depends(get_receipt_gateway),
):
    try:
        return await gateway.recognize_raw(body.qrraw)
    except ReceiptProviderError as exc:
        logger.warning("Receipt provider request failed", extra={"provider": "receipt_api"})
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Receipt provider unavailable",
        ) from exc


@post("/receipts/get_receipt_by_raw_qr")
async def get_receipt_by_raw_qr(
    qrfile: UploadFile,
    gateway: ReceiptGateway = Depends(get_receipt_gateway),
):
    contents = await qrfile.read(QR_UPLOAD_MAX_BYTES + 1)
    if len(contents) > QR_UPLOAD_MAX_BYTES:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            detail="QR image is too large",
        )

    try:
        return await gateway.recognize_image(
            contents,
            filename=qrfile.filename or "receipt.jpg",
            content_type=qrfile.content_type or "image/jpeg",
        )
    except ReceiptProviderError as exc:
        logger.warning("Receipt provider request failed", extra={"provider": "receipt_api"})
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Receipt provider unavailable",
        ) from exc


@get("/receipts", response_model=list[ReceiptSchema])
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
        .options(selectinload(Receipt.items))
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
        ReceiptSchema(
            id=r.id,
            date=r.date,
            store=r.store,
            total=r.total,
            items=[
                ReceiptItemSchema(
                    name=i.name,
                    quantity=i.quantity,
                    unit=i.unit,
                    price=i.price,
                )
                for i in (r.items or [])
            ],
        )
        for r in receipts
    ]


@post(
    "/receipts",
    status_code=status.HTTP_201_CREATED,
    response_model=StatusResponse,
)
async def upload_receipt(
    body: ReceiptSchema,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entitlement = await get_entitlement(db, user)
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
    )
    db.add(receipt)

    for item in body.items:
        ri = ReceiptItem(
            receipt_id=receipt.id,
            name=item.name,
            quantity=item.quantity,
            unit=item.unit,
            price=item.price,
        )
        db.add(ri)
    await db.commit()
    return {"status": "ok"}


@post(
    "/receipts/array",
    status_code=status.HTTP_201_CREATED,
    response_model=StatusResponse,
)
async def upload_receipts(
    body: ReceiptSchemaArray,
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
    new_receipt_bodies = [receipt for receipt in receipt_bodies if receipt.id not in existing]
    receipts = [
        Receipt(
            id=r.id,
            date=r.date,
            store=r.store,
            total=r.total,
            user_id=user.id,
            receipt_expires_at=compute_receipt_expiry(entitlement.active),
        )
        for r in new_receipt_bodies
    ]

    for receipt in receipts:
        db.add(receipt)

    for receipt in new_receipt_bodies:
        for item in receipt.items:
            ri = ReceiptItem(
                receipt_id=receipt.id,
                name=item.name,
                quantity=item.quantity,
                unit=item.unit,
                price=item.price,
            )
            db.add(ri)
    await db.commit()
    return {"status": "ok"}


@get("/receipts/{receipt_id}", response_model=ReceiptSchema)
async def get_receipt(
    receipt_id: str,
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
    return ReceiptSchema(
        id=r.id,
        date=r.date,
        store=r.store,
        total=r.total,
        items=[
            ReceiptItemSchema(name=i.name, quantity=i.quantity, unit=i.unit, price=i.price)
            for i in (r.items or [])
        ],
    )


@patch("/receipts/{receipt_id}", response_model=ReceiptSchema)
async def update_receipt(
    receipt_id: str,
    body: ReceiptSchema,
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

    for item in body.items:
        ri = ReceiptItem(
            receipt_id=r.id,
            name=item.name,
            quantity=item.quantity,
            unit=item.unit,
            price=item.price,
        )
        db.add(ri)

    await db.commit()

    # Re-fetch to get fresh items
    await db.refresh(r, ["items"])
    return ReceiptSchema(
        id=r.id,
        date=r.date,
        store=r.store,
        total=r.total,
        items=[
            ReceiptItemSchema(name=i.name, quantity=i.quantity, unit=i.unit, price=i.price)
            for i in (r.items or [])
        ],
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
