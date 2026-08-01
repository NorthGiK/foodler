from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import GOOGLE_PLAY_PRODUCT_IDS, PAYMENT_AMOUNT_RUB, SUBSCRIPTION_PERIOD_DAYS
from src.models import (
    Payment,
    PaymentStatus,
    Subscription,
    SubscriptionProvider,
    User,
)


class PaymentVerificationError(ValueError):
    """A webhook does not match the authoritative payment state."""


class GoogleSubscriptionVerificationError(ValueError):
    """A Google Play purchase does not grant the requested entitlement."""


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


async def apply_google_play_purchase(
    db: AsyncSession,
    *,
    user: User,
    purchase_token: str,
    product_id: str,
    remote_purchase: dict[str, Any],
) -> Subscription:
    if product_id not in GOOGLE_PLAY_PRODUCT_IDS:
        raise GoogleSubscriptionVerificationError("Google product is not allowed")
    allowed_states = {
        "SUBSCRIPTION_STATE_ACTIVE",
        "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    }
    if remote_purchase.get("subscriptionState") not in allowed_states:
        raise GoogleSubscriptionVerificationError("Google subscription is not active")
    if remote_purchase.get("acknowledgementState") != "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED":
        raise GoogleSubscriptionVerificationError("Google subscription is not acknowledged")

    line_items = remote_purchase.get("lineItems")
    if not isinstance(line_items, list):
        raise GoogleSubscriptionVerificationError("Google subscription has no line items")
    matching_items = [
        item
        for item in line_items
        if isinstance(item, dict) and item.get("productId") == product_id
    ]
    if not matching_items:
        raise GoogleSubscriptionVerificationError("Google product does not match")
    expiries = [
        _parse_google_time(item.get("expiryTime"))
        for item in matching_items
        if item.get("expiryTime")
    ]
    if not expiries:
        raise GoogleSubscriptionVerificationError("Google expiry is missing")
    expires_at = max(expiries)
    if expires_at <= _utcnow_naive():
        raise GoogleSubscriptionVerificationError("Google subscription expired")

    account_ids = remote_purchase.get("externalAccountIdentifiers") or {}
    expected_account_id = hashlib.sha256(user.id.encode()).hexdigest()
    if account_ids.get("obfuscatedExternalAccountId") != expected_account_id:
        raise GoogleSubscriptionVerificationError("Google purchase owner does not match")

    owner = await db.scalar(
        select(Subscription).where(Subscription.purchase_token == purchase_token)
    )
    if owner is not None and owner.user_id != user.id:
        raise GoogleSubscriptionVerificationError("Google purchase is already linked")

    subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if subscription is None:
        subscription = Subscription(user_id=user.id)
        db.add(subscription)
    subscription.purchase_token = purchase_token
    subscription.product_id = product_id
    subscription.provider = SubscriptionProvider.GOOGLE_PLAY
    subscription.active = True
    subscription.expires_at = expires_at
    user.premium = True
    user.subscription_expires = expires_at
    await db.commit()
    return subscription


def _parse_google_time(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError) as exc:
        raise GoogleSubscriptionVerificationError("Google expiry is invalid") from exc
    return _naive_utc(parsed) or _utcnow_naive()
