import os

from dotenv import load_dotenv

load_dotenv()


def _get_env(env_key: str) -> str:
    value = os.getenv(env_key)
    if value is None:
        raise ValueError(f"{env_key}=None!!!\n{__file__}")

    return value


def _get_bool(env_key: str, default: bool) -> bool:
    raw = os.getenv(env_key)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{env_key} must be a boolean")


def _get_secret(env_key: str, minimum_length: int = 32) -> str:
    value = _get_env(env_key)
    if len(value) < minimum_length:
        raise ValueError(f"{env_key} must contain at least {minimum_length} characters")
    return value


def _get_csv(env_key: str, default: str = "") -> tuple[str, ...]:
    return tuple(value.strip() for value in os.getenv(env_key, default).split(",") if value.strip())


DATABASE_URL = _get_env("DATABASE_URL")
SECRET_KEY = _get_secret("SECRET_KEY")
PREVIOUS_SECRET_KEYS = _get_csv("PREVIOUS_SECRET_KEYS")
if any(len(key) < 32 for key in PREVIOUS_SECRET_KEYS):
    raise ValueError("Every PREVIOUS_SECRET_KEYS entry must contain at least 32 characters")
API_KEY_QR = _get_env("API_QR_KEY")
API_URL = _get_env("API_URL")
QR_API_TIMEOUT_SECONDS = float(os.getenv("QR_API_TIMEOUT_SECONDS", "15"))
QR_UPLOAD_MAX_BYTES = int(os.getenv("QR_UPLOAD_MAX_BYTES", 10 * 1024 * 1024))
RECEIPT_PAGE_SIZE_MAX = int(os.getenv("RECEIPT_PAGE_SIZE_MAX", "100"))
# AI
AI_API_KEY = _get_env("AI_API_KEY")
AI_BASE_URL = _get_env("AI_BASE_URL")
AI_LIGHT_MODEL = os.getenv("AI_LIGHT_MODEL")
AI_STRONG_MODEL = os.getenv("AI_STRONG_MODEL")
AI_TIMEOUT_SECONDS = float(os.getenv("AI_TIMEOUT_SECONDS", "90"))
PRODUCT_FUZZY_CANDIDATE_LIMIT = int(os.getenv("PRODUCT_FUZZY_CANDIDATE_LIMIT", "300"))

# PAYMENT
PAYMENT_ACCOUNT_ID = _get_env("PAYMENT_ACCOUNT_ID")
PAYMENT_SECRET_KEY = _get_env("PAYMENT_SECRET_KEY")
SUBSCRIPTION_PERIOD_DAYS = int(os.getenv("SUBSCRIPTION_PERIOD_DAYS", "30"))
PAYMENT_TIMEOUT_SECONDS = float(os.getenv("PAYMENT_TIMEOUT_SECONDS", "10"))
PAYMENT_MAX_ATTEMPTS = int(os.getenv("PAYMENT_MAX_ATTEMPTS", "2"))
PAYMENT_BUDGET_AMOUNT_RUB = os.getenv("PAYMENT_BUDGET_AMOUNT_RUB", "300.00")
PAYMENT_PREMIUM_AMOUNT_RUB = os.getenv("PAYMENT_PREMIUM_AMOUNT_RUB", "800.00")
PAYMENT_RETURN_URL = os.getenv("PAYMENT_RETURN_URL", "https://foodler.site/")

ALGORITHM = "HS256"
JWT_ISSUER = os.getenv("JWT_ISSUER", "foodler-api")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "foodler-mobile")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days

# Password requirements
PASSWORD_MIN_LENGTH = int(os.getenv("PASSWORD_MIN_LENGTH", 6))
PASSWORD_REQUIRE_UPPERCASE = _get_bool("PASSWORD_REQUIRE_UPPERCASE", False)
PASSWORD_REQUIRE_LOWERCASE = _get_bool("PASSWORD_REQUIRE_LOWERCASE", False)
PASSWORD_REQUIRE_DIGIT = _get_bool("PASSWORD_REQUIRE_DIGIT", True)
PASSWORD_REQUIRE_SPECIAL = _get_bool("PASSWORD_REQUIRE_SPECIAL", False)

# Email code expiration (minutes)
EMAIL_CODE_EXPIRE_MINUTES = 10
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = 10

# Rate limiting
MAX_CODE_SENDS_PER_10_MINUTES = 3
TRUST_PROXY_HEADERS = _get_bool("TRUST_PROXY_HEADERS", False)

# Runtime
CORS_ORIGINS = _get_csv(
    "CORS_ORIGINS",
    "http://localhost:8081,http://localhost:19006",
)
RECEIPT_CLEANUP_INTERVAL_SECONDS = int(os.getenv("RECEIPT_CLEANUP_INTERVAL_SECONDS", "3600"))
METRICS_TOKEN = os.getenv("METRICS_TOKEN", "")
