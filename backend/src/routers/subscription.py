from datetime import datetime, timezone
from uuid import uuid4
import hmac
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi_throttle import RateLimiter
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from yookassa import Configuration, Payment

from ..auth import get_current_user
from ..database import get_db
from ..models import Subscription, User, Payment as MPayment
from ..config import PAYMENT_ACCOUNT_ID, PAYMENT_SECRET_KEY
from ..utils import with_rate_limit
from ..schemas import (
    CreatePaymentRequest,
    PaymentConfirmationResponse,
    PremiumStatusResponse,
)

router = APIRouter(tags=["Subscription"], prefix="/subscription")
get = with_rate_limit(router.get, RateLimiter(100, 1))
post = with_rate_limit(router.post, RateLimiter(100, 1))


Configuration.account_id = PAYMENT_ACCOUNT_ID
Configuration.secret_key = PAYMENT_SECRET_KEY


def _utcnow() -> datetime:
    """Timezone-safe UTC now."""
    return datetime.now(timezone.utc)


def _verify_yookassa_signature(request: Request, body_bytes: bytes) -> bool:
    """Verify YooKassa webhook signature using HMAC-SHA256."""
    signature = request.headers.get("X-Yookassa-Signature")
    if not signature:
        return False

    # YooKassa sends signature as "sha256=<hash>"
    if not signature.startswith("sha256="):
        return False

    expected_hash = signature[7:]  # Remove "sha256=" prefix

    # Compute HMAC-SHA256 of body using secret key
    computed = hmac.new(
        PAYMENT_SECRET_KEY.encode("utf-8"),
        body_bytes,
        hashlib.sha256
    ).hexdigest()

    # Use compare_digest to prevent timing attacks
    return hmac.compare_digest(expected_hash, computed)


@get("")
async def get_subscription(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current subscription status."""
    q = select(Subscription).where(Subscription.user_id == user.id)
    result = await db.execute(q)
    subscription = result.scalar_one_or_none()

    if subscription is None:
        return {
            "active": False,
            "platform": None,
            "expiresAt": None,
        }

    return {
        "active": subscription.active,
        "platform": "yookassa" if subscription.purchase_token is None else "google",
        "expiresAt": subscription.expires_at.isoformat() if subscription.expires_at else None,
    }


@get("/is_premium", response_model=PremiumStatusResponse)
async def is_premium(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if user has active premium subscription."""
    now = _utcnow()
    q = select(User.premium, User.subscription_expires).where(User.id == user.id)
    result = await db.execute(q)
    premium, expires = result.one_or_none() or (False, None)

    # Check if subscription is still valid
    if premium and expires:
        # Ensure timezone-aware
        expires = expires.replace(tzinfo=timezone.utc) if expires.tzinfo is None else expires
        if expires < now:
            premium = False
            await db.execute(
                update(User).where(User.id == user.id).values(premium=False)
            )
            await db.commit()

    return {"premium": premium}


@post("/payment", response_model=PaymentConfirmationResponse)
async def create_payment(
    body: CreatePaymentRequest | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create YooKassa payment for premium subscription."""
    # Prevent abuse: limit pending payments to 3
    q = select(MPayment).where(
        MPayment.user_id == user.id,
        MPayment.status == "in_progress",
    )
    result = await db.execute(q)
    pending_count = len(result.scalars().all())
    if pending_count >= 3:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many pending payments. Please complete or cancel existing payments first.",
        )

    now = _utcnow()

    # Build payment with optional payment method
    payment_data = {
        "amount": {
            "value": "5.00",
            "currency": "RUB",
        },
        "capture": True,
        "description": f"Food Tracker Premium для {user.email}",
        "confirmation": {
            "type": "redirect",
            "return_url": "https://foodler.site/",
        },
        "metadata": {
            "user_id": user.id,
        }
    }

    # Add payment_method_data if specified
    if body and body.paymentMethod:
        payment_data["payment_method_data"] = {
            "type": body.paymentMethod,
        }

    payment = Payment.create(payment_data, hash(uuid4()))
    if payment.confirmation is None:
        Payment.cancel(payment.id)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR)

    mpayment = MPayment(
        id=payment.id,
        user_id=user.id,
        created_at=now,
        status="in_progress",
    )
    db.add(mpayment)
    await db.commit()

    return {"confirmationUrl": payment.confirmation.confirmation_url}


# BUG: неправильно работает проверка сигнатуры от ответа юкассы, поэтому сейчас костыльная защита
@router.post("/yookassa/webhook", status_code=status.HTTP_404_NOT_FOUND)
async def webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Fail closed until YooKassa event authenticity is implemented."""
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="YooKassa webhook is disabled",
    )
