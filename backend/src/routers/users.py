from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.utils import DatabaseRateLimiter, with_rate_limit

from ..auth import get_current_user
from ..database import get_db
from ..email_service import EmailService
from ..models import User
from ..schemas import FeedbackRequest, MessageResponse, UserResponse
from ..services.entitlements import get_entitlement

router = APIRouter(tags=["Users"])
get = with_rate_limit(router.get, DatabaseRateLimiter(100, 1))
post = with_rate_limit(router.post, DatabaseRateLimiter(10, 1))


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
        subscriptionExpires=entitlement.expires_at,
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
