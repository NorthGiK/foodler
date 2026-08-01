from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import PAYMENT_AMOUNT_RUB, SUBSCRIPTION_PERIOD_DAYS
from src.models import (
    Payment,
    PaymentStatus,
    Subscription,
    SubscriptionProvider,
    User,
)


class PaymentVerificationError(ValueError):
    """A webhook does not match the authoritative payment state."""


def _value(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _naive_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def verify_yookassa_payment(
    remote_payment: Any,
    *,
    payment_id: str,
    user_id: str,
    expected_status: str,
) -> None:
    amount = _value(remote_payment, "amount")
    metadata = _value(remote_payment, "metadata", {}) or {}
    try:
        amount_value = Decimal(str(_value(amount, "value")))
        expected_amount = Decimal(PAYMENT_AMOUNT_RUB)
    except (InvalidOperation, TypeError) as exc:
        raise PaymentVerificationError("Invalid payment amount") from exc

    checks = (
        (_value(remote_payment, "id") == payment_id, "Payment ID mismatch"),
        (
            _value(remote_payment, "status") == expected_status,
            "Payment status mismatch",
        ),
        (amount_value == expected_amount, "Payment amount mismatch"),
        (_value(amount, "currency") == "RUB", "Payment currency mismatch"),
        (str(_value(metadata, "user_id", "")) == user_id, "Payment owner mismatch"),
    )
    if expected_status == "succeeded":
        checks += ((_value(remote_payment, "paid") is True, "Payment is not paid"),)

    for valid, message in checks:
        if not valid:
            raise PaymentVerificationError(message)


async def apply_yookassa_event(
    db: AsyncSession,
    *,
    event: str,
    payment_id: str,
    remote_payment: Any,
) -> str:
    local_result = await db.execute(select(Payment).where(Payment.id == payment_id))
    local_payment = local_result.scalar_one_or_none()
    if local_payment is None:
        raise PaymentVerificationError("Unknown payment")

    expected_status = "succeeded" if event == "payment.succeeded" else "canceled"
    verify_yookassa_payment(
        remote_payment,
        payment_id=payment_id,
        user_id=local_payment.user_id,
        expected_status=expected_status,
    )

    if event == "payment.canceled":
        await db.execute(
            update(Payment)
            .where(
                Payment.id == payment_id,
                Payment.status == PaymentStatus.IN_PROGRESS,
            )
            .values(status=PaymentStatus.REJECTED)
        )
        await db.commit()
        return "rejected"

    if local_payment.status == PaymentStatus.SUCCESS:
        return "already_processed"
    if local_payment.status != PaymentStatus.IN_PROGRESS:
        raise PaymentVerificationError("Payment is not pending")

    claimed = await db.execute(
        update(Payment)
        .where(
            Payment.id == payment_id,
            Payment.status == PaymentStatus.IN_PROGRESS,
        )
        .values(status=PaymentStatus.SUCCESS)
    )
    if claimed.rowcount != 1:
        await db.commit()
        current_status = await db.scalar(select(Payment.status).where(Payment.id == payment_id))
        if current_status == PaymentStatus.SUCCESS:
            return "already_processed"
        raise PaymentVerificationError("Payment state changed")

    user = await db.get(User, local_payment.user_id)
    if user is None:
        await db.rollback()
        raise PaymentVerificationError("Payment owner does not exist")

    now = _utcnow_naive()
    current_expiry = _naive_utc(user.subscription_expires)
    subscription_expires = max(now, current_expiry or now) + timedelta(
        days=SUBSCRIPTION_PERIOD_DAYS
    )
    user.premium = True
    user.subscription_expires = subscription_expires

    subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if subscription is None:
        subscription = Subscription(
            user_id=user.id,
            purchase_token=f"yookassa:{payment_id}",
            product_id="premium_monthly",
            provider=SubscriptionProvider.YOOKASSA,
        )
        db.add(subscription)
    else:
        subscription.purchase_token = f"yookassa:{payment_id}"
        subscription.product_id = "premium_monthly"
        subscription.provider = SubscriptionProvider.YOOKASSA
    subscription.active = True
    subscription.expires_at = subscription_expires

    await db.commit()
    return "processed"
