import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    JWT_AUDIENCE,
    JWT_ISSUER,
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES,
    PREVIOUS_SECRET_KEYS,
    SECRET_KEY,
)
from .database import get_db
from .models import User

security = HTTPBearer()


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode(), salt=salt).hex()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), bytes.fromhex(hashed))


def create_access_token(user_id: str, auth_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "exp": expire,
        "iat": now,
        "jti": uuid4().hex,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "type": "access",
        "ver": auth_version,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_email_code() -> str:
    return f"{secrets.randbelow(100_000_000):08d}"


def hash_email_code(email: str, code: str) -> str:
    normalized_email = email.strip().lower()
    return hmac.new(
        SECRET_KEY.encode(),
        f"{normalized_email}:{code}".encode(),
        hashlib.sha256,
    ).hexdigest()


def create_password_reset_token(user_id: str, auth_version: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "exp": now + timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
        "iat": now,
        "jti": uuid4().hex,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "type": "password_reset",
        "ver": auth_version,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_password_reset_token(token: str) -> tuple[str, int]:
    last_error: jwt.PyJWTError | None = None
    for key in (SECRET_KEY, *PREVIOUS_SECRET_KEYS):
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=[ALGORITHM],
                audience=JWT_AUDIENCE,
                issuer=JWT_ISSUER,
                options={
                    "require": ["exp", "sub", "iat", "jti", "iss", "aud", "type", "ver"]
                },
            )
            if payload.get("type") != "password_reset":
                raise jwt.InvalidTokenError("Unexpected token type")
            user_id = payload.get("sub")
            if not isinstance(user_id, str) or not user_id:
                raise jwt.InvalidTokenError("Invalid subject")
            auth_version = payload.get("ver")
            if not isinstance(auth_version, int):
                raise jwt.InvalidTokenError("Invalid auth version")
            return user_id, auth_version
        except jwt.PyJWTError as exc:
            last_error = exc
    raise last_error or jwt.InvalidTokenError("Invalid token")


def _decode_access_token(token: str) -> dict:
    last_error: jwt.PyJWTError | None = None
    for key in (SECRET_KEY, *PREVIOUS_SECRET_KEYS):
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=[ALGORITHM],
                audience=JWT_AUDIENCE,
                issuer=JWT_ISSUER,
                options={"require": ["exp", "sub", "iat", "jti", "iss", "aud", "type", "ver"]},
            )
            if payload.get("type") != "access":
                raise jwt.InvalidTokenError("Unexpected token type")
            return payload
        except jwt.PyJWTError as exc:
            last_error = exc
    raise last_error or jwt.InvalidTokenError("Invalid token")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = _decode_access_token(token)
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if payload.get("ver", 0) != user.auth_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
    return user


async def get_current_user_optional(
    credentials=Depends(HTTPBearer(auto_error=False)),
    db: AsyncSession = Depends(get_db),
):
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


async def get_current_user_optional_strict(
    credentials: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False)),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Allow anonymous requests, but never downgrade a supplied bad token."""
    if credentials is None:
        return None
    return await get_current_user(credentials, db)


async def get_current_user_optional_from_request(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        return await get_current_user(
            HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), db
        )
    except HTTPException:
        return None
