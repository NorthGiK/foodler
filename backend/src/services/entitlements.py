"""Authoritative subscription entitlement reads and compatibility cache updates."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import Subscription, SubscriptionProvider, User


@dataclass(frozen=True)
class Entitlement:
    active: bool
    expires_at: datetime | None
    provider: SubscriptionProvider | None


def utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def normalize_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


async def get_entitlement(
    db: AsyncSession,
    user: User,
    *,
    now: datetime | None = None,
) -> Entitlement:
    """Read Subscription as source of truth and refresh legacy User cache fields."""
    current_time = normalize_utc(now) or utcnow_naive()
    subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    expires_at = normalize_utc(subscription.expires_at) if subscription else None
    active = bool(
        subscription
        and subscription.active
        and expires_at is not None
        and expires_at > current_time
    )

    dirty = False
    if subscription and subscription.active != active:
        subscription.active = active
        dirty = True
    if user.premium != active:
        user.premium = active
        dirty = True
    if user.subscription_expires != expires_at:
        user.subscription_expires = expires_at
        dirty = True
    if dirty:
        await db.commit()

    return Entitlement(
        active=active,
        expires_at=expires_at,
        provider=subscription.provider if subscription else None,
    )
