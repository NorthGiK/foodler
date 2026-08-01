import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_throttle import RateLimiter
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import PAYMENT_AMOUNT_RUB, PAYMENT_RETURN_URL
from ..database import get_db
from ..integrations.yookassa import YooKassaError, yookassa_gateway
from ..models import Payment as MPayment
from ..models import Subscription, User
from ..schemas import (
    CreatePaymentRequest,
    PaymentConfirmationResponse,
    PremiumStatusResponse,
    StatusResponse,
    SubscriptionStatusResponse,
    YooKassaWebhookRequest,
)
from ..services.subscriptions import PaymentVerificationError, apply_yookassa_event
from ..utils import with_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Subscription"], prefix="/subscription")
get = with_rate_limit(router.get, RateLimiter(100, 1))
post = with_rate_limit(router.post, RateLimiter(100, 1))


def _utcnow() -> datetime:
    """Timezone-safe UTC now."""
    return datetime.now(timezone.utc)


@get("", response_model=SubscriptionStatusResponse)
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
        "platform": (
            "yookassa"
            if subscription.purchase_token.startswith("yookassa:")
            else "google"
        ),
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
            await db.execute(update(User).where(User.id == user.id).values(premium=False))
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
    q = (
        select(func.count())
        .select_from(MPayment)
        .where(
            MPayment.user_id == user.id,
            MPayment.status == "in_progress",
        )
    )
    pending_count = await db.scalar(q) or 0
    if pending_count >= 3:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many pending payments. Please complete or cancel existing payments first.",
        )

    now = _utcnow()

    # Build payment with optional payment method
    payment_data = {
        "amount": {
            "value": PAYMENT_AMOUNT_RUB,
            "currency": "RUB",
        },
        "capture": True,
        "description": "Foodler Premium",
        "confirmation": {
            "type": "redirect",
            "return_url": PAYMENT_RETURN_URL,
        },
        "metadata": {
            "user_id": user.id,
        },
    }

    # Add payment_method_data if specified
    if body and body.paymentMethod:
        payment_data["payment_method_data"] = {
            "type": body.paymentMethod,
        }

    idempotency_key = str(uuid4())
    try:
        payment = await yookassa_gateway.create_payment(payment_data, idempotency_key)
    except YooKassaError as exc:
        logger.warning(
            "Payment provider request failed",
            extra={"provider": "yookassa", "event": "payment.create"},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider unavailable",
        ) from exc

    if payment.confirmation is None:
        try:
            await yookassa_gateway.cancel_payment(payment.id, str(uuid4()))
        except YooKassaError:
            logger.warning(
                "Payment cancellation failed",
                extra={"provider": "yookassa", "event": "payment.cancel"},
            )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider returned no confirmation",
        )

    mpayment = MPayment(
        id=payment.id,
        user_id=user.id,
        created_at=now,
        status="in_progress",
    )
    db.add(mpayment)
    await db.commit()

    return {"confirmationUrl": payment.confirmation.confirmation_url}


@router.post("/yookassa/webhook", response_model=StatusResponse)
async def webhook(
    body: YooKassaWebhookRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify the current payment at YooKassa, then apply the event once."""
    try:
        remote_payment = await yookassa_gateway.get_payment(body.object.id)
    except YooKassaError as exc:
        logger.warning(
            "Payment verification unavailable",
            extra={"provider": "yookassa", "event": body.event},
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment verification unavailable",
        ) from exc

    try:
        result = await apply_yookassa_event(
            db,
            event=body.event,
            payment_id=body.object.id,
            remote_payment=remote_payment,
        )
    except PaymentVerificationError as exc:
        logger.warning(
            "Payment notification rejected",
            extra={"provider": "yookassa", "event": body.event},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment notification rejected",
        ) from exc

    logger.info(
        "Payment notification processed",
        extra={"provider": "yookassa", "event": body.event},
    )
    return {"status": result}
