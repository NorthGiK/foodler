from datetime import datetime, timedelta, timezone


from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_throttle import RateLimiter
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from ..config import (
    EMAIL_CODE_EXPIRE_MINUTES,
    MAX_CODE_SENDS_PER_10_MINUTES,
    REFRESH_TOKEN_EXPIRE_MINUTES,
)
from ..database import get_db
from ..email_service import EmailService
from ..models import EmailCodesStorage, RefreshToken, User, _uuid, _email_code
from ..schemas import (
    AuthResponse,
    ForgotPassword,
    ForgotPasswordVerify,
    MessageResponse,
    LoginRequest,
    RefreshRequest,
    SendCodeRequest,
    UserResponse,
    VerifyCodeRequest,
)
from ..utils import validate_password, with_rate_limit

router = APIRouter(tags=["Auth"])
post = with_rate_limit(router.post, RateLimiter(100, 1))


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@post("/auth/send-code", response_model=MessageResponse)
async def send_code(body: SendCodeRequest, db: AsyncSession = Depends(get_db)):
    """Send verification code to email"""
    # Clean up expired codes
    await _cleanup_expired_codes(db)

    # Check rate limiting
    codes = await db.execute(
        select(EmailCodesStorage).where(
            EmailCodesStorage.email == body.email,
            EmailCodesStorage.created_at
            > (_utcnow_naive() - timedelta(minutes=EMAIL_CODE_EXPIRE_MINUTES)),
        )
    )
    recent_codes = codes.scalars().all()
    if len(recent_codes) >= MAX_CODE_SENDS_PER_10_MINUTES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification codes sent. Please wait 10 minutes.",
        )

    storage = EmailCodesStorage(email=body.email)
    db.add(storage)
    await db.commit()

    # Send email
    await EmailService.send_code(body.email, storage.code)

    return {"message": "Verification code sent"}


@post("/auth/verify-code", response_model=AuthResponse)
async def verify_code(body: VerifyCodeRequest, db: AsyncSession = Depends(get_db)):
    """Verify code and return tokens (for login/registration)"""
    # Clean up expired codes
    await _cleanup_expired_codes(db)

    result = await db.execute(
        select(EmailCodesStorage).where(
            EmailCodesStorage.email == body.email,
            EmailCodesStorage.code == body.code,
            EmailCodesStorage.created_at
            > _utcnow_naive() - timedelta(minutes=EMAIL_CODE_EXPIRE_MINUTES),
        )
    )
    code_storage = result.scalar_one_or_none()

    if not code_storage:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code",
        )

    # Delete used code
    await db.delete(code_storage)

    # Find or create user
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user is None:
        # Registration: create a new user
        if not body.password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password is required for registration",
            )
        # Validate password
        try:
            validate_password(body.password)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        user = User(
            email=body.email,
            password_hash=hash_password(body.password),
        )
        db.add(user)
        await db.flush()
    else:
        # Update password if provided (for password reset flow)
        if body.password:
            # Validate password
            try:
                validate_password(body.password)
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(e),
                )
            user.password_hash = hash_password(body.password)

    # Generate tokens
    access_token = create_access_token(user.id)
    refresh_token_str = create_refresh_token()

    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=REFRESH_TOKEN_EXPIRE_MINUTES
    )

    rt = RefreshToken(token=refresh_token_str, user_id=user.id, expires_at=expires_at)
    db.add(rt)
    await db.commit()

    return AuthResponse(
        accessToken=access_token,
        refreshToken=refresh_token_str,
        user=UserResponse(
            id=user.id,
            email=user.email,
            premium=user.premium or False,
            subscriptionExpires=user.subscription_expires,
        ),
    )


@post("/auth/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Legacy login endpoint - kept for backward compatibility"""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token(user.id)
    refresh_token_str = create_refresh_token()

    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=REFRESH_TOKEN_EXPIRE_MINUTES
    )

    rt = RefreshToken(token=refresh_token_str, user_id=user.id, expires_at=expires_at)
    db.add(rt)
    await db.commit()

    return AuthResponse(
        accessToken=access_token,
        refreshToken=refresh_token_str,
        user=UserResponse(
            id=user.id,
            email=user.email,
            premium=user.premium or False,
            subscriptionExpires=user.subscription_expires,
        ),
    )


@post("/auth/forgot-password/send-code", response_model=MessageResponse)
async def forgot_password_send_code(
    body: ForgotPassword,
    db: AsyncSession = Depends(get_db),
):
    """Send password reset code"""
    # Clean up expired codes
    await _cleanup_expired_codes(db)

    # Check if user exists
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user:
        # Don't reveal if email exists or not
        print("not user")
        return {"message": "If the email exists, a reset code has been sent"}

    # Check rate limiting — count codes created in the last N minutes
    result = await db.execute(
        select(EmailCodesStorage).where(
            EmailCodesStorage.email == body.email,
            EmailCodesStorage.created_at
            > _utcnow_naive() - timedelta(minutes=EMAIL_CODE_EXPIRE_MINUTES),
        )
    )
    recent_codes = result.scalars().all()
    if len(recent_codes) >= MAX_CODE_SENDS_PER_10_MINUTES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many reset codes sent. Please wait 10 minutes.",
        )

    # Generate and store code
    code = _email_code()
    print(code)
    code_id = _uuid()

    storage = EmailCodesStorage(
        id=code_id,
        email=body.email,
        code=code,
    )
    db.add(storage)
    await db.commit()

    # Send email
    await EmailService.send_code(
        body.email,
        code,
        subject="Сброс пароля",
    )

    return {"message": "If the email exists, a reset code has been sent"}


@post("/auth/forgot-password/verify-code", response_model=MessageResponse)
async def forgot_password_verify_code(
    body: ForgotPasswordVerify, db: AsyncSession = Depends(get_db)
):
    """Verify reset code and set new password"""
    # Clean up expired codes
    await _cleanup_expired_codes(db)

    # Find a valid (non-expired) code
    result = await db.execute(
        select(EmailCodesStorage).where(
            EmailCodesStorage.email == body.email,
            EmailCodesStorage.code == body.code,
            EmailCodesStorage.created_at
            > _utcnow_naive() - timedelta(minutes=EMAIL_CODE_EXPIRE_MINUTES),
        )
    )
    code_storage = result.scalar_one_or_none()

    if not code_storage:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired reset code",
        )

    # Delete used code
    await db.delete(code_storage)

    # Validate new password
    try:
        validate_password(body.new_password)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Find user and update password
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.password_hash = hash_password(body.new_password)
    await db.commit()

    return {"message": "Password reset successful"}


@post("/auth/refresh", response_model=AuthResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token == body.refreshToken)
    )
    rt = result.scalar_one_or_none()
    if not rt:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    if rt.expires_at.replace(tzinfo=None) < _utcnow_naive():
        await db.delete(rt)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )

    user_result = await db.execute(select(User).where(User.id == rt.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Delete old refresh token
    await db.delete(rt)

    access_token = create_access_token(user.id)
    refresh_token_str = create_refresh_token()

    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=REFRESH_TOKEN_EXPIRE_MINUTES
    )

    new_rt = RefreshToken(
        token=refresh_token_str, user_id=user.id, expires_at=expires_at
    )
    db.add(new_rt)
    await db.commit()

    return AuthResponse(
        accessToken=access_token,
        refreshToken=refresh_token_str,
        user=UserResponse(
            id=user.id,
            email=user.email,
            premium=user.premium or False,
            subscriptionExpires=user.subscription_expires,
        ),
    )


async def _cleanup_expired_codes(db: AsyncSession) -> None:
    """Remove expired email verification codes"""
    cutoff = _utcnow_naive() - timedelta(minutes=EMAIL_CODE_EXPIRE_MINUTES)
    await db.execute(
        delete(EmailCodesStorage)
        .where(EmailCodesStorage.created_at < cutoff)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
