"""Privacy-preserving product analytics ingestion and preference controls."""

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user_optional_strict
from ..config import SECRET_KEY
from ..database import get_db
from ..models import AnalyticsEvent, AnalyticsInstallation, User
from ..schemas import (
    AnalyticsEventsRequest,
    AnalyticsIngestResponse,
    AnalyticsPreferenceRequest,
    AnalyticsPreferenceResponse,
)
from ..utils import DatabaseRateLimiter, with_rate_limit

MAX_CLOCK_SKEW = timedelta(hours=24)
_INSTALLATION_HASH_DOMAIN = b"foodler.analytics.installation.v1:"

router = APIRouter(prefix="/product-analytics", tags=["Product Analytics"])
post = with_rate_limit(router.post, DatabaseRateLimiter(120, 60))
put = with_rate_limit(router.put, DatabaseRateLimiter(30, 60))


async def _enabled_account_guard(db: AsyncSession, user_id: str) -> str | None:
    """Serialize analytics work with account opt-out for a linked identity."""
    return await db.scalar(
        update(User)
        .where(User.id == user_id, User.analytics_enabled.is_(True))
        .values(analytics_enabled=True)
        .returning(User.id)
    )


def _installation_hash(raw_installation_id: str) -> str:
    return hmac.new(
        SECRET_KEY.encode(), _INSTALLATION_HASH_DOMAIN + raw_installation_id.encode(), hashlib.sha256
    ).hexdigest()


async def _installation(
    db: AsyncSession, installation_hash: str, user: User | None, *, create: bool
) -> AnalyticsInstallation | None:
    installation = await db.scalar(
        select(AnalyticsInstallation).where(AnalyticsInstallation.installation_hash == installation_hash)
    )
    if installation is None and create:
        installation = AnalyticsInstallation(installation_hash=installation_hash, user_id=user.id if user else None)
        db.add(installation)
        await db.flush()
    elif installation is not None and user is not None:
        if installation.user_id is None:
            installation.user_id = user.id
        elif installation.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Installation already linked")
    return installation


@post("/events", response_model=AnalyticsIngestResponse)
async def ingest_events(
    body: AnalyticsEventsRequest,
    user: User | None = Depends(get_current_user_optional_strict),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsIngestResponse:
    now = datetime.now(timezone.utc)
    if any(abs(now - event.occurredAt) > MAX_CLOCK_SKEW for event in body.events):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Event timestamp out of range")
    # A conditional write is the consent guard: it obtains SQLite's writer
    # serialization before an event insert, so a committed opt-out wins over
    # concurrent ingestion instead of a stale ORM read.
    if user is not None:
        account_guard = await _enabled_account_guard(db, user.id)
        if account_guard is None:
            return AnalyticsIngestResponse(accepted=False, inserted=0)

    installation = await _installation(db, _installation_hash(body.installationId), user, create=True)
    if installation is None:
        return AnalyticsIngestResponse(accepted=False, inserted=0)
    if user is None and installation.user_id is not None:
        account_guard = await _enabled_account_guard(db, installation.user_id)
        if account_guard is None:
            return AnalyticsIngestResponse(accepted=False, inserted=0)
    installation_guard = await db.scalar(
        update(AnalyticsInstallation)
        .where(AnalyticsInstallation.id == installation.id, AnalyticsInstallation.enabled.is_(True))
        .values(last_seen_at=now.replace(tzinfo=None))
        .returning(AnalyticsInstallation.id)
    )
    if installation_guard is None:
        return AnalyticsIngestResponse(accepted=False, inserted=0)
    inserted = 0
    for event in body.events:
        result = await db.execute(
            sqlite_insert(AnalyticsEvent)
            .values(
                id=uuid4().hex,
                idempotency_id=event.eventId,
                event_name=event.eventName.value,
                occurred_at=event.occurredAt.replace(tzinfo=None),
                received_at=now.replace(tzinfo=None),
                installation_id=installation.id,
                user_id=user.id if user else None,
                session_id=event.sessionId,
                platform=body.platform,
                app_version=body.appVersion,
                app_build=body.appBuild,
                os_version=body.osVersion,
                locale=body.locale,
                timezone=body.timezone,
                properties=event.properties,
            )
            .on_conflict_do_nothing(index_elements=["idempotency_id"])
        )
        inserted += int(bool(result.rowcount))
    await db.commit()
    return AnalyticsIngestResponse(accepted=True, inserted=inserted)


@put("/preference", response_model=AnalyticsPreferenceResponse)
async def set_preference(
    body: AnalyticsPreferenceRequest,
    user: User | None = Depends(get_current_user_optional_strict),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsPreferenceResponse:
    installation = await _installation(db, _installation_hash(body.installationId), user, create=True)
    if user is None:
        assert installation is not None
        effective_enabled = body.enabled
        if body.enabled and installation.user_id is not None:
            effective_enabled = (
                await _enabled_account_guard(db, installation.user_id)
            ) is not None
        installation.enabled = effective_enabled
        if not effective_enabled:
            await db.execute(
                update(AnalyticsEvent)
                .where(AnalyticsEvent.installation_id == installation.id)
                .values(user_id=None, installation_id=None)
            )
    else:
        await db.execute(update(User).where(User.id == user.id).values(analytics_enabled=body.enabled))
        await db.execute(
            update(AnalyticsInstallation).where(AnalyticsInstallation.user_id == user.id).values(enabled=body.enabled)
        )
        if not body.enabled:
            installation_ids = list(
                (await db.scalars(select(AnalyticsInstallation.id).where(AnalyticsInstallation.user_id == user.id))).all()
            )
            await db.execute(
                update(AnalyticsEvent)
                .where(
                    (AnalyticsEvent.user_id == user.id)
                    | AnalyticsEvent.installation_id.in_(installation_ids)
                )
                .values(user_id=None, installation_id=None)
            )
    await db.commit()
    return AnalyticsPreferenceResponse(
        enabled=body.enabled if user is not None else effective_enabled
    )
