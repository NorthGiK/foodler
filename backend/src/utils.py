import re
from datetime import datetime
from typing import Callable
from functools import wraps

from fastapi import Depends
from fastapi_throttle import RateLimiter

from .config import (
    PASSWORD_MIN_LENGTH,
    PASSWORD_REQUIRE_UPPERCASE,
    PASSWORD_REQUIRE_LOWERCASE,
    PASSWORD_REQUIRE_DIGIT,
    PASSWORD_REQUIRE_SPECIAL,
)


# ============================================================
# Rate limiting
# ============================================================

LIMIT_DEFAULT = RateLimiter(100, 1)
LIMIT_DELETE = RateLimiter(50, 1)


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

    if PASSWORD_REQUIRE_UPPERCASE and not re.search(r"[A-Z]", password):
        raise PasswordValidationError("Пароль должен содержать хотя бы одну заглавную букву")

    if PASSWORD_REQUIRE_LOWERCASE and not re.search(r"[a-z]", password):
        raise PasswordValidationError("Пароль должен содержать хотя бы одну строчную букву")

    if PASSWORD_REQUIRE_DIGIT and not re.search(r"\d", password):
        raise PasswordValidationError("Пароль должен содержать хотя бы одну цифру")

    if PASSWORD_REQUIRE_SPECIAL and not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
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
