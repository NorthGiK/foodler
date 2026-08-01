import os
from dotenv import load_dotenv

load_dotenv()


def _get_env(env_key: str) -> str:
    value = os.getenv(env_key)
    if value is None:
        raise ValueError(f"{env_key}=None!!!\n{__file__}")

    return value


DATABASE_URL = _get_env("DATABASE_URL")
SECRET_KEY = _get_env("SECRET_KEY")
API_KEY_QR = _get_env("API_QR_KEY")
API_URL = _get_env("API_URL")
QR_API_TIMEOUT_SECONDS = float(os.getenv("QR_API_TIMEOUT_SECONDS", "15"))
QR_UPLOAD_MAX_BYTES = int(os.getenv("QR_UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)))

# AI
AI_API_KEY = _get_env("AI_API_KEY")
AI_BASE_URL = _get_env("AI_BASE_URL")
AI_LIGHT_MODEL = os.getenv("AI_LIGHT_MODEL", "gpt-5.4-mini")
AI_STRONG_MODEL = os.getenv("AI_STRONG_MODEL", "gpt-5.4-mini")

# PAYMENT
PAYMENT_ACCOUNT_ID = _get_env("PAYMENT_ACCOUNT_ID")
PAYMENT_SECRET_KEY = _get_env("PAYMENT_SECRET_KEY")
SUBSCRIPTION_PERIOD_DAYS = int(os.getenv("SUBSCRIPTION_PERIOD_DAYS", "30"))
PAYMENT_TIMEOUT_SECONDS = float(os.getenv("PAYMENT_TIMEOUT_SECONDS", "10"))
PAYMENT_MAX_ATTEMPTS = int(os.getenv("PAYMENT_MAX_ATTEMPTS", "2"))
PAYMENT_AMOUNT_RUB = os.getenv("PAYMENT_AMOUNT_RUB", "5.00")
PAYMENT_RETURN_URL = os.getenv("PAYMENT_RETURN_URL", "https://foodler.site/")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 14  # 2 weeks
REFRESH_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days

# Password requirements
PASSWORD_MIN_LENGTH = 8
PASSWORD_REQUIRE_UPPERCASE = False
PASSWORD_REQUIRE_LOWERCASE = False
PASSWORD_REQUIRE_DIGIT = False
PASSWORD_REQUIRE_SPECIAL = False

# Email code expiration (minutes)
EMAIL_CODE_EXPIRE_MINUTES = 10

# Rate limiting
MAX_CODE_SENDS_PER_10_MINUTES = 3
