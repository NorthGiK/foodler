"""
AI credits management.

Rules:
- action="ask": weight=2
- other actions: weight=1
- premium user: 10 credits per 2-day period
- authorized/unauthorized user: 2 credits per month (5-day usage window from first use)
"""
import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import AiCreditUsage, User


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()


def _utcnow() -> datetime:
    """Timezone-safe UTC now."""
    return datetime.now(timezone.utc)


async def get_user_credits_info(
    db: AsyncSession,
    user: User | None,
    ip: str | None = None,
) -> dict:
    now = _utcnow()
    ip_h = _ip_hash(ip or "") if ip else None

    # premium user: 10 credits per 2-day period
    # Make subscription_expires timezone-aware for comparison
    subscription_expires = None
    if user:
        subscription_expires = user.subscription_expires
        if subscription_expires and subscription_expires.tzinfo is None:
            subscription_expires = subscription_expires.replace(tzinfo=timezone.utc)

    if user and user.premium and subscription_expires and subscription_expires > now:
        user_id = user.id
        period_start = now - timedelta(days=now.day % 2)
        period_start = period_start.replace(hour=0, minute=0, second=0, microsecond=0)
        q = select(AiCreditUsage).where(
            AiCreditUsage.user_id == user_id,
            AiCreditUsage.created_at >= period_start,
        )
        res = await db.execute(q)
        used_in_period = sum(u.credits for u in res.scalars().all())
        period_limit = 10.0
        remaining = max(0.0, period_limit - used_in_period)
        return {
            "remaining": remaining,
            "period_limit": period_limit,
            "weekly_limit": int(period_limit * 3.5),
            "monthly_limit": period_limit * 15,
            "period": "2day",
            "subscription": True,
        }

    # authorized/unauthorized: 2 credits per month with 5-day usage window
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    if user:
        user_id = user.id
        # Get all usage this month
        q = select(AiCreditUsage).where(
            AiCreditUsage.user_id == user_id,
            AiCreditUsage.created_at >= month_start,
        )
    else:
        user_id = None
        q = select(AiCreditUsage).where(
            AiCreditUsage.user_id.is_(None),
            AiCreditUsage.ip_hash == ip_h,
            AiCreditUsage.created_at >= month_start,
        )

    res = await db.execute(q)
    month_usages = res.scalars().all()
    month_usage = sum(u.credits for u in month_usages)

    # Check if user has any usage this month and if within 5-day window
    if month_usages:
        first_use = min(u.created_at for u in month_usages)
        # Make first_use timezone-aware if needed for comparison
        if first_use.tzinfo is None:
            first_use = first_use.replace(tzinfo=timezone.utc)
        days_since_first_use = (now - first_use).days
        in_usage_window = days_since_first_use < 5
    else:
        in_usage_window = True  # Haven't used yet, can use

    monthly_limit = 2.0
    remaining = max(0.0, monthly_limit - month_usage)

    # If not in usage window or all credits used, remaining is 0
    if not in_usage_window or remaining <= 0:
        remaining = 0.0

    period = "month"
    return {
        "remaining": remaining,
        "period_limit": monthly_limit,
        "weekly_limit": 0.0,
        "monthly_limit": monthly_limit,
        "period": period,
        "subscription": False,
    }


async def deduct_credits(
    db: AsyncSession,
    user: User | None,
    ip: str | None,
    action: str,
) -> None:
    weight = 2.0 if action == "ask" else 1.0
    ip_h = _ip_hash(ip or "") if ip else None
    usage = AiCreditUsage(
        user_id=user.id if user else None,
        ip_hash=ip_h,
        action=action,
        credits=weight,
    )
    db.add(usage)
    await db.commit()
