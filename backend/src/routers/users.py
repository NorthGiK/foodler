from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_throttle import RateLimiter

from ..auth import get_current_user
from ..email_service import EmailService
from ..models import User
from ..schemas import FeedbackRequest, MessageResponse, UserResponse
from src.utils import with_rate_limit

router = APIRouter(tags=["Users"])
get = with_rate_limit(router.get, RateLimiter(100, 1))
post = with_rate_limit(router.post, RateLimiter(10, 1))


@router.get("/users/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse(
        id=user.id,
        email=user.email,
        premium=user.premium or False,
        subscriptionExpires=user.subscription_expires,
    )


@post("/users/send-feedback", response_model=MessageResponse)
async def send_feedback(body: FeedbackRequest):
    """Send feedback with optional images to the app owner"""
    success = await EmailService.send_feedback(
        from_email=body.email,
        text=body.text,
        images=body.images or None,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send feedback",
        )
    return {"message": "Feedback sent successfully"}
