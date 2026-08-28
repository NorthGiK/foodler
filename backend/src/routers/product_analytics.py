"""Firebase identity controls and compatibility routes for retired ingestion."""

import hashlib
import hmac

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, get_current_user_optional_strict
from ..config import SECRET_KEY
from ..database import get_db
from ..models import User
from ..schemas import (
    AnalyticsEventsRequest,
    AnalyticsIdentityMode,
    AnalyticsIdentityModeRequest,
    AnalyticsIdentityResolveRequest,
    AnalyticsIdentityResponse,
    AnalyticsIngestResponse,
    AnalyticsPreferenceRequest,
    AnalyticsPreferenceResponse,
)

_ACCOUNT_ID_DOMAIN = b"foodler.firebase.account.v1:"
_DEVICE_ID_DOMAIN = b"foodler.firebase.device.v1:"

router = APIRouter(prefix="/product-analytics", tags=["Product Analytics"])
post = router.post
put = router.put


def _analytics_id(domain: bytes, value: str) -> str:
    """Return a stable, domain-separated pseudonym; never return ``value``."""
    return hmac.new(SECRET_KEY.encode(), domain + value.encode(), hashlib.sha256).hexdigest()


@post("/events", response_model=AnalyticsIngestResponse)
async def ingest_events(
    body: AnalyticsEventsRequest,
    user: User | None = Depends(get_current_user_optional_strict),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsIngestResponse:
    """Deprecated: Firebase SDKs deliver telemetry directly to Firebase."""
    return AnalyticsIngestResponse(accepted=False, inserted=0)


@put("/preference", response_model=AnalyticsPreferenceResponse)
async def set_preference(
    body: AnalyticsPreferenceRequest,
    user: User | None = Depends(get_current_user_optional_strict),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsPreferenceResponse:
    """Deprecated boolean preference mapped to the account identity mode.

    Guests are permanently anonymous and this endpoint no longer stores a
    per-installation preference.
    """
    if user is None:
        return AnalyticsPreferenceResponse(enabled=False)
    user.analytics_identity_mode = (
        AnalyticsIdentityMode.IDENTIFIED.value if body.enabled else AnalyticsIdentityMode.ANONYMOUS.value
    )
    await db.commit()
    return AnalyticsPreferenceResponse(enabled=body.enabled)


@post("/identity/resolve", response_model=AnalyticsIdentityResponse)
async def resolve_identity(
    body: AnalyticsIdentityResolveRequest,
    user: User = Depends(get_current_user),
) -> AnalyticsIdentityResponse:
    mode = AnalyticsIdentityMode(user.analytics_identity_mode)
    if mode is AnalyticsIdentityMode.ANONYMOUS:
        return AnalyticsIdentityResponse(mode=mode)
    return AnalyticsIdentityResponse(
        mode=mode,
        accountAnalyticsId=_analytics_id(_ACCOUNT_ID_DOMAIN, user.id),
        deviceAnalyticsId=_analytics_id(_DEVICE_ID_DOMAIN, body.deviceId),
    )


@put("/identity-mode", response_model=AnalyticsIdentityResponse)
async def set_identity_mode(
    body: AnalyticsIdentityModeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsIdentityResponse:
    user.analytics_identity_mode = body.mode.value
    await db.commit()
    return AnalyticsIdentityResponse(mode=body.mode)
