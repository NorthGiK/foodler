import hashlib
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Callable

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .config import (
    PASSWORD_MIN_LENGTH,
    PASSWORD_REQUIRE_DIGIT,
    PASSWORD_REQUIRE_LOWERCASE,
    PASSWORD_REQUIRE_SPECIAL,
    PASSWORD_REQUIRE_UPPERCASE,
    TRUST_PROXY_HEADERS,
)
from .database import get_db
from .models import RateLimitBucket

# ============================================================
# Rate limiting
# ============================================================


class DatabaseRateLimiter:
    """Cross-process fixed-window limiter backed by the shared SQLite database."""

    def __init__(self, times: int, seconds: int):
        if times < 1 or seconds < 1:
            raise ValueError("Rate limit values must be positive")
        self.times = times
        self.seconds = seconds

    async def __call__(
        self,
        request: Request,
        response: Response,
        db: AsyncSession = Depends(get_db),
    ) -> None:
        aware_now = datetime.now(timezone.utc)
        now = aware_now.replace(tzinfo=None)
        window_epoch = int(aware_now.timestamp()) // self.seconds
        identity = _request_identity(request)
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        raw_key = f"{identity}:{request.method}:{path}:{window_epoch}:{self.seconds}"
        key = hashlib.sha256(raw_key.encode()).hexdigest()
        expires_at = datetime.fromtimestamp(
            (window_epoch + 1) * self.seconds,
            tz=timezone.utc,
        ).replace(tzinfo=None)

        await db.execute(
            sqlite_insert(RateLimitBucket)
            .values(bucket_key=key, request_count=0, expires_at=expires_at)
            .on_conflict_do_nothing(index_elements=["bucket_key"])
        )
        request_count = await db.scalar(
            update(RateLimitBucket)
            .where(
                RateLimitBucket.bucket_key == key,
                RateLimitBucket.request_count < self.times,
                RateLimitBucket.expires_at > now,
            )
            .values(request_count=RateLimitBucket.request_count + 1)
            .returning(RateLimitBucket.request_count)
        )
        await db.commit()
        if request_count is None:
            retry_after = max(1, int((expires_at - now).total_seconds()))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too Many Requests",
                headers={"Retry-After": str(retry_after)},
            )

        response.headers["X-RateLimit-Limit"] = str(self.times)
        response.headers["X-RateLimit-Remaining"] = str(max(0, self.times - request_count))


def _request_identity(request: Request) -> str:
    if TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",", maxsplit=1)[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


async def cleanup_rate_limit_buckets(db: AsyncSession) -> int:
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
    result = await db.execute(delete(RateLimitBucket).where(RateLimitBucket.expires_at < cutoff))
    await db.commit()
    return result.rowcount or 0


LIMIT_DEFAULT = DatabaseRateLimiter(100, 1)
LIMIT_DELETE = DatabaseRateLimiter(50, 1)


def with_rate_limit(fastapi_decorator: Callable, rate_limiter):
    """
    Оборачивает APIRouter.get/post/... и автоматически
    добавляет RateLimiter в dependencies.
    """

    @wraps(fastapi_decorator)
    def decorator(*args, **kwargs):
        dependencies = list(kwargs.pop("dependencies", []))
        dependencies.append(Depends(rate_limiter))
        kwargs["dependencies"] = dependencies
        return fastapi_decorator(*args, **kwargs)

    return decorator


# ============================================================
# Date helpers
# ============================================================


def normalize_date(date_str: str | None) -> str | None:
    """Нормализует дату DD.MM.YYYY → YYYY-MM-DD, ISO остается как есть."""
    if not isinstance(date_str, str):
        return
    if not date_str:
        return
    # Если уже ISO (YYYY-MM-DD)
    if len(date_str) == 10 and date_str[4] == "-":
        return date_str
    # Если DD.MM.YYYY
    if len(date_str) == 10 and date_str[2] == "." and date_str[5] == ".":
        return f"{date_str[6:10]}-{date_str[3:5]}-{date_str[0:2]}"
    # Если ISO с T (datetime)
    if "T" in date_str:
        return date_str[:10]
    return date_str


def parse_date(date_str: str | None) -> datetime:
    """Парсит дату из ISO (YYYY-MM-DD) или DD.MM.YYYY формата."""
    if not date_str:
        return datetime.now()
    # ISO format с T (datetime)
    if "T" in date_str:
        try:
            return datetime.fromisoformat(date_str)
        except ValueError:
            pass
    # DD.MM.YYYY
    if len(date_str) == 10 and date_str[2] == ".":
        try:
            return datetime.strptime(date_str, "%d.%m.%Y")
        except ValueError:
            pass
    # YYYY-MM-DD
    if len(date_str) == 10 and date_str[4] == "-":
        try:
            return datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            pass
    # Fallback: пробуем ISO
    try:
        return datetime.fromisoformat(date_str)
    except (ValueError, TypeError):
        return datetime.now()


class PasswordValidationError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


def validate_password(password: str) -> None:
    """Validate password against configured requirements"""
    if len(password) < PASSWORD_MIN_LENGTH:
        raise PasswordValidationError(
            f"Пароль должен содержать не менее {PASSWORD_MIN_LENGTH} символов"
        )

    if PASSWORD_REQUIRE_UPPERCASE and not any(char.isupper() for char in password):
        raise PasswordValidationError("Пароль должен содержать хотя бы одну заглавную букву")

    if PASSWORD_REQUIRE_LOWERCASE and not any(char.islower() for char in password):
        raise PasswordValidationError("Пароль должен содержать хотя бы одну строчную букву")

    if PASSWORD_REQUIRE_DIGIT and not any(char.isdigit() for char in password):
        raise PasswordValidationError("Пароль должен содержать хотя бы одну цифру")

    if PASSWORD_REQUIRE_SPECIAL and not any(
        not char.isalnum() and not char.isspace() for char in password
    ):
        raise PasswordValidationError("Пароль должен содержать хотя бы один специальный символ")


def get_password_requirements() -> dict:
    """Return password requirements for frontend"""
    return {
        "minLength": PASSWORD_MIN_LENGTH,
        "requireUppercase": PASSWORD_REQUIRE_UPPERCASE,
        "requireLowercase": PASSWORD_REQUIRE_LOWERCASE,
        "requireDigit": PASSWORD_REQUIRE_DIGIT,
        "requireSpecial": PASSWORD_REQUIRE_SPECIAL,
    }
