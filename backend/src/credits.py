"""Atomic AI credit accounting."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import AiCreditBalance, AiCreditUsage, User

REGULAR_LIMIT = 2.0
PREMIUM_LIMIT = 10.0
REGULAR_WINDOW_DAYS = 5


class InsufficientCreditsError(RuntimeError):
    """The current credit bucket cannot cover an action."""


@dataclass(frozen=True)
class CreditReservation:
    usage_id: str
    bucket_key: str
    cost: float


@dataclass(frozen=True)
class CreditPeriod:
    start: datetime
    end: datetime
    limit: float
    label: str
    subscription: bool


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()


def _utcnow() -> datetime:
    """Return naive UTC for SQLite DateTime comparisons."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def credit_cost(action: str) -> float:
    return 2.0 if action == "ask" else 1.0


def _is_premium(user: User | None, now: datetime) -> bool:
    if not user or not user.premium or not user.subscription_expires:
        return False
    expires = user.subscription_expires
    if expires.tzinfo is not None:
        expires = expires.astimezone(timezone.utc).replace(tzinfo=None)
    return expires > now


def _premium_period(now: datetime) -> CreditPeriod:
    epoch = datetime(1970, 1, 1)
    elapsed_days = (now.date() - epoch.date()).days
    start = epoch + timedelta(days=elapsed_days - elapsed_days % 2)
    return CreditPeriod(
        start=start,
        end=start + timedelta(days=2),
        limit=PREMIUM_LIMIT,
        label="2day",
        subscription=True,
    )


def _month_bounds(now: datetime) -> tuple[datetime, datetime]:
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def _bucket_key(user: User | None, ip_hash: str | None, period: CreditPeriod) -> str:
    identity = f"user:{user.id}" if user else f"ip:{ip_hash or 'missing'}"
    source = f"{identity}:{period.start.isoformat()}:{period.label}"
    return hashlib.sha256(source.encode()).hexdigest()


async def _usage_in_period(
    db: AsyncSession,
    *,
    user: User | None,
    ip_hash: str | None,
    start: datetime,
) -> list[AiCreditUsage]:
    query = select(AiCreditUsage).where(AiCreditUsage.created_at >= start)
    if user:
        query = query.where(AiCreditUsage.user_id == user.id)
    else:
        query = query.where(AiCreditUsage.user_id.is_(None), AiCreditUsage.ip_hash == ip_hash)
    return list((await db.scalars(query)).all())


async def _period_and_usage(
    db: AsyncSession,
    user: User | None,
    ip_hash: str | None,
    now: datetime,
) -> tuple[CreditPeriod, float]:
    if _is_premium(user, now):
        period = _premium_period(now)
        usages = await _usage_in_period(db, user=user, ip_hash=ip_hash, start=period.start)
        return period, sum(item.credits for item in usages)

    month_start, month_end = _month_bounds(now)
    usages = await _usage_in_period(db, user=user, ip_hash=ip_hash, start=month_start)
    first_use = min((item.created_at for item in usages), default=now)
    if first_use.tzinfo is not None:
        first_use = first_use.astimezone(timezone.utc).replace(tzinfo=None)
    period = CreditPeriod(
        start=month_start,
        end=min(month_end, first_use + timedelta(days=REGULAR_WINDOW_DAYS)),
        limit=REGULAR_LIMIT,
        label="month",
        subscription=False,
    )
    return period, sum(item.credits for item in usages)


async def get_user_credits_info(
    db: AsyncSession,
    user: User | None,
    ip: str | None = None,
) -> dict[str, float | str | bool]:
    now = _utcnow()
    ip_hash = _ip_hash(ip) if ip else None
    period, historical_used = await _period_and_usage(db, user, ip_hash, now)
    key = _bucket_key(user, ip_hash, period)
    balance = await db.get(AiCreditBalance, key)
    used = balance.used if balance else historical_used
    remaining = max(0.0, period.limit - used) if now < period.end else 0.0
    return {
        "remaining": remaining,
        "period_limit": period.limit,
        "weekly_limit": int(period.limit * 3.5) if period.subscription else 0.0,
        "monthly_limit": period.limit * 15 if period.subscription else period.limit,
        "period": period.label,
        "subscription": period.subscription,
    }


async def reserve_credits(
    db: AsyncSession,
    user: User | None,
    ip: str | None,
    action: str,
) -> CreditReservation:
    now = _utcnow()
    ip_hash = _ip_hash(ip) if ip else None
    period, historical_used = await _period_and_usage(db, user, ip_hash, now)
    cost = credit_cost(action)
    key = _bucket_key(user, ip_hash, period)

    await db.execute(
        sqlite_insert(AiCreditBalance)
        .values(
            bucket_key=key,
            user_id=user.id if user else None,
            ip_hash=ip_hash,
            period_start=period.start,
            period_end=period.end,
            period_limit=period.limit,
            used=min(historical_used, period.limit),
            updated_at=now,
        )
        .on_conflict_do_nothing(index_elements=["bucket_key"])
    )
    claimed = await db.execute(
        update(AiCreditBalance)
        .where(
            AiCreditBalance.bucket_key == key,
            AiCreditBalance.period_end > now,
            AiCreditBalance.used + cost <= AiCreditBalance.period_limit,
        )
        .values(
            used=AiCreditBalance.used + cost,
            updated_at=now,
        )
    )
    if claimed.rowcount != 1:
        await db.commit()
        raise InsufficientCreditsError("AI credits exceeded")

    usage_id = uuid4().hex
    db.add(
        AiCreditUsage(
            id=usage_id,
            user_id=user.id if user else None,
            ip_hash=ip_hash,
            action=action,
            credits=cost,
            created_at=now,
        )
    )
    await db.commit()
    return CreditReservation(usage_id=usage_id, bucket_key=key, cost=cost)


async def refund_credits(
    db: AsyncSession,
    reservation: CreditReservation,
) -> None:
    removed = await db.execute(
        delete(AiCreditUsage).where(AiCreditUsage.id == reservation.usage_id)
    )
    if removed.rowcount == 1:
        await db.execute(
            update(AiCreditBalance)
            .where(
                AiCreditBalance.bucket_key == reservation.bucket_key,
                AiCreditBalance.used >= reservation.cost,
            )
            .values(
                used=AiCreditBalance.used - reservation.cost,
                updated_at=_utcnow(),
            )
        )
    await db.commit()


async def deduct_credits(
    db: AsyncSession,
    user: User | None,
    ip: str | None,
    action: str,
) -> CreditReservation:
    """Backward-compatible name for the atomic reservation operation."""
    return await reserve_credits(db, user, ip, action)
