import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..config import PAYMENT_BUDGET_AMOUNT_RUB, PAYMENT_PREMIUM_AMOUNT_RUB, PAYMENT_RETURN_URL
from ..database import get_db
from ..integrations.yookassa import (
    YooKassaError,
    YooKassaGateway,
    yookassa_gateway,
)
from ..models import Payment as MPayment
from ..models import PaymentStatus, Subscription, User
from ..schemas import (
    CreatePaymentRequest,
    PaymentConfirmationResponse,
    PremiumStatusResponse,
    StatusResponse,
    SubscriptionStatusResponse,
    YooKassaWebhookRequest,
)
from ..services.entitlements import get_entitlement
from ..services.subscriptions import (
    PaymentVerificationError,
    apply_yookassa_event,
)
from ..utils import DatabaseRateLimiter, with_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Subscription"], prefix="/subscription")
get = with_rate_limit(router.get, DatabaseRateLimiter(100, 1))
post = with_rate_limit(router.post, DatabaseRateLimiter(100, 1))


def provide_yookassa_gateway() -> YooKassaGateway:
    return yookassa_gateway


def _utcnow() -> datetime:
    """Timezone-safe UTC now."""
    return datetime.now(timezone.utc)


@get("", response_model=SubscriptionStatusResponse)
async def get_subscription(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current subscription status."""
    entitlement = await get_entitlement(db, user)
    subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if entitlement.provider is None:
        return {
            "active": False,
            "platform": None,
            "expiresAt": None,
        }

    return {
        "active": entitlement.active,
        "platform": entitlement.provider.value,
        "expiresAt": entitlement.expires_at.isoformat() if entitlement.expires_at else None,
        "plan": subscription.product_id if subscription and subscription.product_id in {"budget_monthly", "premium_monthly"} else None,
    }


@get("/is_premium", response_model=PremiumStatusResponse)
async def is_premium(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if user has active premium subscription."""
    entitlement = await get_entitlement(db, user)
    return {"premium": entitlement.active}


@post("/payment", response_model=PaymentConfirmationResponse)
async def create_payment(
    body: CreatePaymentRequest | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    gateway: YooKassaGateway = Depends(provide_yookassa_gateway),
):
    """Create YooKassa payment for premium subscription."""
    # Prevent abuse: limit pending payments to 3
    q = (
        select(func.count())
        .select_from(MPayment)
        .where(
            MPayment.user_id == user.id,
            MPayment.status == PaymentStatus.IN_PROGRESS,
        )
    )
    pending_count = await db.scalar(q) or 0
    if pending_count >= 3:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many pending payments. Please complete or cancel existing payments first.",
        )

    now = _utcnow()
    plan = body.plan if body else "budget_monthly"
    amount = PAYMENT_BUDGET_AMOUNT_RUB if plan == "budget_monthly" else PAYMENT_PREMIUM_AMOUNT_RUB

    # Build payment with optional payment method
    payment_data = {
        "amount": {
            "value": amount,
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
            "plan": plan,
        },
    }

    # Add payment_method_data if specified
    if body and body.paymentMethod:
        payment_data["payment_method_data"] = {
            "type": body.paymentMethod,
        }

    idempotency_key = str(uuid4())
    try:
        payment = await gateway.create_payment(payment_data, idempotency_key)
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
            await gateway.cancel_payment(payment.id, str(uuid4()))
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
        status=PaymentStatus.IN_PROGRESS,
        plan_id=plan,
    )
    db.add(mpayment)
    await db.commit()

    return {"confirmationUrl": payment.confirmation.confirmation_url}


@router.post("/yookassa/webhook", response_model=StatusResponse)
async def webhook(
    body: YooKassaWebhookRequest,
    db: AsyncSession = Depends(get_db),
    gateway: YooKassaGateway = Depends(provide_yookassa_gateway),
):
    """Verify the current payment at YooKassa, then apply the event once."""
    try:
        remote_payment = await gateway.get_payment(body.object.id)
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
