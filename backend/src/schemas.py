from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, Any, Literal, TypedDict

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

# --- Auth ---


class SendCodeRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=8, max_length=8, pattern=r"^\d{8}$")
    password: str | None = Field(default=None, max_length=128)


class ForgotPasswordVerify(BaseModel):
    email: EmailStr
    code: str = Field(min_length=8, max_length=8, pattern=r"^\d{8}$")
    new_password: str = Field(min_length=1, max_length=128)


class ForgotPasswordConfirmCode(BaseModel):
    email: EmailStr
    code: str = Field(min_length=8, max_length=8, pattern=r"^\d{8}$")


class PasswordResetTokenResponse(BaseModel):
    resetToken: str


class PasswordResetRequest(BaseModel):
    resetToken: str = Field(min_length=1, max_length=2048)
    new_password: str = Field(min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


LoginRequest = RegisterRequest


class RefreshRequest(BaseModel):
    refreshToken: str = Field(min_length=32, max_length=256)


class AuthResponse(BaseModel):
    accessToken: str
    refreshToken: str
    user: "UserResponse"


class UserResponse(BaseModel):
    id: str
    email: str
    premium: bool
    analyticsIdentityEnabled: bool
    analyticsExternalId: str | None
    subscriptionExpires: datetime | None = None
    createdAt: datetime

    _created_at_utc = field_validator("createdAt")(_as_utc)


class AnalyticsIdentityPreferenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool


class AnalyticsIdentityPreferenceResponse(BaseModel):
    enabled: bool
    analyticsExternalId: str | None


class ForgotPassword(BaseModel):
    email: EmailStr


class FeedbackRequest(BaseModel):
    email: EmailStr
    text: str = Field(min_length=1, max_length=10_000)
    images: list[Annotated[str, Field(max_length=2_000_000)]] = Field(
        default_factory=list,
        max_length=5,
    )


class MessageResponse(BaseModel):
    message: str


class StatusResponse(BaseModel):
    status: str


# --- Devices ---


class RegisterDeviceRequest(BaseModel):
    deviceId: str
    model: str | None = None
    os: str | None = None


class DeviceResponse(RegisterDeviceRequest):
    id: str
    createdAt: datetime | None = None


# --- Receipts ---


class ReceiptRawResponseSchema(BaseModel):
    code: int
    receiptId: str | None = None
    # The receipt provider owns the nested payload and may add or change fields.
    # Keep it transparent to the client; only persistence validates fields it uses.
    data: dict[str, Any] | None
    # The provider echoes the fiscal QR here. It is required by the mobile
    # client to build a stable local/server idempotency key.
    request: dict[str, Any] | None = None


class GetReceiptFromQRSchema(BaseModel):
    qrraw: str = Field(min_length=1, max_length=4096)


class GetReceiptFromRawQRSchema(BaseModel):
    qrfile: str  # base64


class ReceiptItemSchema(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    quantity: float = Field(default=1, gt=0)
    unit: Literal["g", "kg", "ml", "l", "piece"] = "kg"
    price: float = Field(ge=0, multiple_of=0.01)
    sum: float | None = None
    product_id: str | None = None  # связь с Product после распознавания
    gtin: str | None = Field(default=None, min_length=8, max_length=32)
    category: str | None = Field(default=None, max_length=100)
    category_source: str | None = Field(default=None, max_length=32)
    category_confidence: float | None = Field(default=None, ge=0, le=1)
    category_taxonomy_version: str | None = Field(default=None, max_length=64)
    category_model_version: str | None = Field(default=None, max_length=128)


class ReceiptCreateSchema(BaseModel):
    """Client-controlled fields for creating a receipt."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    date: date
    store: str | None = Field(default=None, max_length=500)
    merchant_identity: str | None = Field(default=None, max_length=500)
    total: float = Field(ge=0, multiple_of=0.01)
    # Raw QR may be supplied by trusted first-party clients; the server stores
    # only its hash and uses it as a per-user idempotency key.
    source_key: str | None = Field(default=None, min_length=1, max_length=4096)
    items: list[ReceiptItemSchema] = Field(default_factory=list, max_length=1000)


class ReceiptUpdateSchema(BaseModel):
    """Client-controlled fields for updating a receipt."""

    model_config = ConfigDict(extra="forbid")

    # Retained for older clients. The route uses its path parameter as the
    # authoritative receipt identifier and intentionally ignores this value.
    id: str | None = Field(default=None, min_length=1, max_length=128)
    date: date
    store: str | None = Field(default=None, max_length=500)
    merchant_identity: str | None = Field(default=None, max_length=500)
    total: float = Field(ge=0, multiple_of=0.01)
    # Retained for payload compatibility; updating a receipt must not alter
    # its server-side source fingerprint.
    source_key: str | None = Field(default=None, min_length=1, max_length=4096)
    items: list[ReceiptItemSchema] = Field(default_factory=list, max_length=1000)


class ReceiptResponseSchema(BaseModel):
    """Server response for persisted receipts, including server creation time."""

    id: str
    date: date
    store: str | None = None
    total: float
    createdAt: datetime
    items: list[ReceiptItemSchema] = Field(default_factory=list)

    _created_at_utc = field_validator("createdAt")(_as_utc)


class ReceiptCreateArraySchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    receipts: list[ReceiptCreateSchema] | None = None


# ====
#  AI
# ====


class AiResponse(BaseModel):
    request_id: int
    status: str
    response_type: Any
    output: str


class AiHistoryItem(BaseModel):
    role: str  # "user" | "assistant"
    text: str = Field(max_length=4000)


class AiRequestParameters(BaseModel):
    periodFrom: str | None = None
    periodTo: str | None = None
    question: str | None = Field(default=None, max_length=4000)
    history: list[AiHistoryItem] | None = Field(default=None, max_length=20)
    members: list[FamilyMember] | None = None
    profile_context: str | None = Field(default=None, max_length=2000)


class AiRequest(BaseModel):
    action: str
    parameters: AiRequestParameters | None = None


class AiSection(BaseModel):
    """Плоский формат секции — совместим с клиентом.

    Поля опциональны, используется только то, что соответствует type:
    - text: text
    - score: value, max
    - list: items
    - products: products
    - chart: labels, values, kind
    """

    model_config = {"extra": "ignore"}

    type: str  # text, score, list, products, chart
    title: str = "Ответ"
    text: str | None = None
    value: float | None = None
    max: float | None = None
    items: list[str] | None = None
    products: list[dict[str, Any]] | None = None
    labels: list[str] | None = None
    values: list[float] | None = None
    kind: str | None = None  # "bar" | "line"


class AiResult(BaseModel):
    id: str
    action: str
    createdAt: str
    sections: list[AiSection]


class CreditsInfo(BaseModel):
    remaining: float
    period_limit: float
    weekly_limit: float
    monthly_limit: float
    period: str  # "2day" | "month" | "week" | "subscription"
    subscription: bool


# --- Subscription ---


class CreatePaymentRequest(BaseModel):
    """Request to create a payment via YooKassa.

    paymentMethod values: bank_card, sbp, sberbank, tinkoff_bank, yoo_money
    If None, YooKassa will show all available payment methods.
    """
    plan: Literal["budget_monthly", "premium_monthly"] = "budget_monthly"

    paymentMethod: Literal["bank_card", "sbp", "sberbank", "tinkoff_bank", "yoo_money"] | None = (
        None
    )


class PremiumStatusResponse(BaseModel):
    premium: bool


class PaymentConfirmationResponse(BaseModel):
    confirmationUrl: str


class SubscriptionStatusResponse(BaseModel):
    active: bool
    platform: Literal["yookassa", "legacy"] | None
    expiresAt: datetime | None
    plan: Literal["budget_monthly", "premium_monthly"] | None = None


class YooKassaWebhookObject(BaseModel):
    id: str


class YooKassaWebhookRequest(BaseModel):
    type: Literal["notification"]
    event: Literal["payment.succeeded", "payment.canceled"]
    object: YooKassaWebhookObject


# ============================================================
# NEW SCHEMAS — Product Knowledge Base
# ============================================================


class ProductSchema(BaseModel):
    """Полная схема продукта."""

    id: str
    name: str
    parent_id: str | None = None
    calories: float = 0
    proteins: float = 0
    fats: float = 0
    carbs: float = 0
    fiber: float | None = None
    sugar: float | None = None
    saturated_fats: float | None = None
    sodium: float | None = None
    cholesterol: float | None = None
    vitamin_a: float | None = None
    vitamin_c: float | None = None
    vitamin_d: float | None = None
    calcium: float | None = None
    iron: float | None = None
    potassium: float | None = None
    magnesium: float | None = None
    serving_size: float | None = None
    serving_unit: str | None = None
    aliases: list[str] = []
    tags: list[dict[str, Any]] = []  # [{name, weight}]


class ProductCreateSchema(BaseModel):
    """Создание нового продукта (вручную или через AI)."""

    name: str
    parent_id: str | None = None
    calories: float = 0
    proteins: float = 0
    fats: float = 0
    carbs: float = 0
    fiber: float | None = None
    sugar: float | None = None
    saturated_fats: float | None = None
    sodium: float | None = None
    cholesterol: float | None = None
    vitamin_a: float | None = None
    vitamin_c: float | None = None
    vitamin_d: float | None = None
    calcium: float | None = None
    iron: float | None = None
    potassium: float | None = None
    magnesium: float | None = None
    serving_size: float | None = None
    serving_unit: str | None = None
    aliases: list[str] = []
    tags: list[str] = []  # имена тегов


class ProductMatchRequest(BaseModel):
    """Запрос на распознавание продукта."""

    raw_name: str
    quantity: float = 1
    unit: str | None = None


class ProductMatchResult(BaseModel):
    """Результат распознавания продукта."""

    product: ProductSchema | None
    confidence: float  # 0.0-1.0
    matched_by: str  # "gtin", "exact", "alias", "ai", "none"
    alternatives: list[ProductSchema] = []


class ProductSearchResult(BaseModel):
    """Результат поиска продуктов."""

    query: str
    results: list[ProductSchema]


class ProductTagSchema(BaseModel):
    id: str
    name: str
    parent_id: str | None = None
    children: list["ProductTagSchema"] = []


class ProductSubstituteSchema(BaseModel):
    product_id: str
    substitute_product_id: str
    substitute_name: str
    similarity_score: float
    ratio: float = 1.0
    notes: str | None = None


# --- Recipe schemas ---


class RecipeIngredientSchema(BaseModel):
    product_id: str
    product_name: str
    quantity: float
    unit: str
    importance_score: float = 1.0
    substitute_ids: list[str] = []


class RecipeCreateSchema(BaseModel):
    name: str
    instructions: str | None = None  # JSON array
    cooking_time_minutes: int | None = None
    tags: list[str] = []
    ingredients: list[RecipeIngredientSchema] = []


class RecipeSchema(BaseModel):
    id: str
    name: str
    instructions: str | None = None
    cooking_time_minutes: int | None = None
    tags: list[str] = []
    ingredients: list[RecipeIngredientSchema] = []
    created_at: str


class RecipeSuggestion(BaseModel):
    """Результат "что приготовить"."""

    recipe: RecipeSchema
    match_score: float  # 0.0-1.0 — насколько все ингредиенты есть
    missing_products: list[dict[str, Any]] = []  # чего не хватает
    available_substitutes: list[dict[str, Any]] = []  # чем можно заменить


# --- Nutrition analysis ---


class NutritionSummary(BaseModel):
    """Агрегированные данные о питании за период."""

    period_from: str
    period_to: str
    total_calories: float
    total_proteins: float
    total_fats: float
    total_carbs: float
    avg_daily_calories: float
    avg_daily_proteins: float
    avg_daily_fats: float
    avg_daily_carbs: float
    by_category: list[dict[str, Any]] = []  # [{tag, calories, proteins, ...}]


# --- Fridge/stock prediction ---


class FridgeProduct(BaseModel):
    """Продукт в холодильнике (прогноз)."""

    product_id: str
    product_name: str
    estimated_quantity: float
    unit: str
    last_purchased: str | None  # дата последней покупки
    expected_expiry: str | None  # прогноз срока годности
    consumption_rate: float  # г/день
    days_until_empty: float | None


# =============
# Personal Info
# =============


class FamilyMember(BaseModel):
    name: str
    age: int
    height: int
    weight: int
    gender: str  # 'Мужской' | 'Женский'
    additional_info: str


class FamilyMemberDict(TypedDict):
    name: str
    age: int
    height: int
    weight: int
    gender: str  # 'Мужской' | 'Женский'
    additional_info: str
