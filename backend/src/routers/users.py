from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.utils import DatabaseRateLimiter, with_rate_limit

from ..auth import get_current_user
from ..database import get_db
from ..email_service import EmailService
from ..models import User
from ..schemas import (
    AnalyticsIdentityPreferenceRequest,
    AnalyticsIdentityPreferenceResponse,
    FeedbackRequest,
    MessageResponse,
    UserResponse,
)
from ..services.entitlements import get_entitlement

router = APIRouter(tags=["Users"])
get = with_rate_limit(router.get, DatabaseRateLimiter(100, 1))
post = with_rate_limit(router.post, DatabaseRateLimiter(10, 1))
put = with_rate_limit(router.put, DatabaseRateLimiter(10, 1))


@router.get("/users/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entitlement = await get_entitlement(db, user)
    return UserResponse(
        id=user.id,
        email=user.email,
        premium=entitlement.active,
        analyticsIdentityEnabled=user.analytics_identity_enabled,
        analyticsExternalId=(
            user.analytics_external_id if user.analytics_identity_enabled else None
        ),
        subscriptionExpires=entitlement.expires_at,
        createdAt=user.created_at,
    )


@put("/users/me/analytics-identity", response_model=AnalyticsIdentityPreferenceResponse)
async def set_analytics_identity_preference(
    body: AnalyticsIdentityPreferenceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsIdentityPreferenceResponse:
    """Update the account-wide external analytics identity preference."""
    user.analytics_identity_enabled = body.enabled
    await db.commit()
    return AnalyticsIdentityPreferenceResponse(
        enabled=user.analytics_identity_enabled,
        analyticsExternalId=(
            user.analytics_external_id if user.analytics_identity_enabled else None
        ),
    )


@post("/users/send-feedback", response_model=MessageResponse)
async def send_feedback(
    body: FeedbackRequest,
    user: User = Depends(get_current_user),
):
    """Send feedback with optional images to the app owner"""
    success = await EmailService.send_feedback(
        from_email=user.email,
        text=body.text,
        images=body.images or None,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send feedback",
        )
    return {"message": "Feedback sent successfully"}
