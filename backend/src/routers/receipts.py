from functools import wraps
from pathlib import Path
import tempfile

from fastapi import APIRouter, Depends, Response, UploadFile, HTTPException, status
from fastapi_throttle import RateLimiter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from aiohttp import ClientSession, FormData
from aiohttp.web_exceptions import HTTPException as WebHTTPException
from aiohttp.http_exceptions import HttpProcessingError
from aiohttp.client import ClientError

from src.config import API_URL, API_KEY_QR
from ..auth import get_current_user
from ..database import get_db
from ..models import Receipt, ReceiptItem, User
from ..receipt_retention import compute_receipt_expiry, cleanup_expired_receipts
from ..schemas import (
    ReceiptItemSchema,
    ReceiptSchema,
    ReceiptRawResponseSchema,
    GetReceiptFromQRSchema,
    ReceiptSchemaArray,
    StatusResponse,
)
from src.utils import with_rate_limit

router = APIRouter(tags=["Receipts"])
get = with_rate_limit(router.get, RateLimiter(100, 1))
post = with_rate_limit(router.post, RateLimiter(100, 1))
delete = with_rate_limit(router.delete, RateLimiter(50, 1))
patch = with_rate_limit(router.patch, RateLimiter(50, 1))

TMP_DIR = Path(tempfile.gettempdir())


def raise_500_if_exception(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except (WebHTTPException, HttpProcessingError, ClientError) as err:
            print(err)
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, err)

    return wrapper


@raise_500_if_exception
@post("/receipts/get_receipt_by_qr", response_model=ReceiptRawResponseSchema)
async def get_receipt_by_qr(body: GetReceiptFromQRSchema):
    async with ClientSession() as session:
        receipt = await session.post(
            API_URL,
            headers={"Content-Type": "application/json"},
            data={
                "qrraw": body.qrraw,
                "token": API_KEY_QR,
            },
        )

    if not receipt.ok:
        print("ERROR from api was happen")
        raise HTTPException(receipt.status, await receipt.text())
    return await receipt.json()


@raise_500_if_exception
@post("/receipts/get_receipt_by_raw_qr")
async def get_receipt_by_raw_qr(qrfile: UploadFile):
    data = FormData()
    data.add_field("token", API_KEY_QR)

    with tempfile.NamedTemporaryFile("wb+", delete=True) as tmp_file:
        tmp_file.write(await qrfile.read())

        data.add_field(
            "qrfile",
            tmp_file.file,
            filename=qrfile.filename,
            content_type="image/jpeg",
        )

        async with ClientSession() as session:
            receipt = await session.post(
                API_URL,
                headers={"Content-Type": "multipart/form-data"},
                data=data,
            )

    return await receipt.json()


@get("/receipts", response_model=list[ReceiptSchema])
async def get_receipts(
    from_date: str | None = None,
    to_date: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Receipt)
        .where(Receipt.user_id == user.id)
        .options(selectinload(Receipt.items))
        .order_by(Receipt.date.desc())
    )
    if from_date:
        query = query.where(Receipt.date >= from_date)
    if to_date:
        query = query.where(Receipt.date <= to_date)

    result = await db.execute(query)
    receipts = result.scalars().all()
    return [
        ReceiptSchema(
            id=r.id,
            date=r.date,
            store=r.store,
            total=r.total,
            items=[
                ReceiptItemSchema(name=i.name, quantity=i.quantity, price=i.price)
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
    receipt = await db.get(Receipt, body.id)
    if receipt:
        return Response()

    receipt = Receipt(
        id=body.id,
        date=body.date,
        store=body.store,
        total=body.total,
        user_id=user.id,
        receipt_expires_at=compute_receipt_expiry(user),
    )
    db.add(receipt)

    for item in body.items:
        ri = ReceiptItem(
            receipt_id=receipt.id,
            name=item.name,
            quantity=item.quantity,
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
    receipts = [
        Receipt(
            id=r.id,
            date=r.date,
            store=r.store,
            total=r.total,
            user_id=user.id,
            receipt_expires_at=compute_receipt_expiry(user),
        )
        for r in receipt_bodies
    ]

    for receipt in receipts:
        db.add(receipt)

    for receipt in receipt_bodies:
        for item in receipt.items:
            ri = ReceiptItem(
                receipt_id=receipt.id,
                name=item.name,
                quantity=item.quantity,
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found"
        )
    return ReceiptSchema(
        id=r.id,
        date=r.date,
        store=r.store,
        total=r.total,
        items=[
            ReceiptItemSchema(name=i.name, quantity=i.quantity, price=i.price)
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found"
        )

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
            ReceiptItemSchema(name=i.name, quantity=i.quantity, price=i.price)
            for i in (r.items or [])
        ],
    )


@post("/receipts/cleanup")
async def cleanup_receipts(db: AsyncSession = Depends(get_db)):
    """Удаление просроченных чеков. Вызывается периодически или вручную."""
    deleted = await cleanup_expired_receipts(db)
    return {"deleted": deleted, "status": "ok"}


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found"
        )
    await db.delete(r)
    await db.commit()
