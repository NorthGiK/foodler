"""Authentication session issuance and revocation business operations."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import create_access_token, create_refresh_token, hash_refresh_token
from src.config import REFRESH_TOKEN_EXPIRE_MINUTES
from src.models import RefreshToken, User


async def issue_tokens(db: AsyncSession, user: User) -> tuple[str, str]:
    access_token = create_access_token(user.id, user.auth_version)
    refresh_token = create_refresh_token()
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
        minutes=REFRESH_TOKEN_EXPIRE_MINUTES
    )
    db.add(
        RefreshToken(
            token_hash=hash_refresh_token(refresh_token),
            user_id=user.id,
            expires_at=expires_at,
        )
    )
    await db.commit()
    return access_token, refresh_token


async def revoke_user_sessions(db: AsyncSession, user: User) -> None:
    user.auth_version += 1
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    await db.commit()
