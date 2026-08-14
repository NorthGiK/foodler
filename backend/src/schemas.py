from __future__ import annotations

from datetime import date, datetime, timezone
from enum import StrEnum
from typing import Annotated, Any, Literal, TypedDict

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StrictBool,
    field_validator,
    model_validator,
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
    analyticsEnabled: bool
    subscriptionExpires: datetime | None = None
    createdAt: datetime

    _created_at_utc = field_validator("createdAt")(_as_utc)


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


class ReceiptCreateSchema(BaseModel):
    """Client-controlled fields for creating a receipt."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    date: date
    store: str | None = Field(default=None, max_length=500)
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


# --- Product analytics ---


class AnalyticsEventName(StrEnum):
    APP_OPENED = "app_opened"
    APP_BACKGROUNDED = "app_backgrounded"
    TAB_VIEWED = "tab_viewed"
    POLICY_ACCEPTED = "policy_accepted"
    REGISTRATION_STARTED = "registration_started"
    REGISTRATION_SUCCEEDED = "registration_succeeded"
    REGISTRATION_FAILED = "registration_failed"
    LOGIN_STARTED = "login_started"
    LOGIN_SUCCEEDED = "login_succeeded"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    RECEIPT_CAPTURE_STARTED = "receipt_capture_started"
    RECEIPT_CAPTURE_SUCCEEDED = "receipt_capture_succeeded"
    RECEIPT_CAPTURE_FAILED = "receipt_capture_failed"
    RECEIPT_MANUAL_CREATED = "receipt_manual_created"
    RECEIPT_DETAIL_VIEWED = "receipt_detail_viewed"
    RECEIPT_DELETED = "receipt_deleted"
    AI_SCREEN_VIEWED = "ai_screen_viewed"
    AI_ACTION_STARTED = "ai_action_started"
    AI_ACTION_SUCCEEDED = "ai_action_succeeded"
    AI_ACTION_FAILED = "ai_action_failed"
    SUBSCRIPTION_SCREEN_VIEWED = "subscription_screen_viewed"
    SUBSCRIPTION_PLAN_SELECTED = "subscription_plan_selected"
    SUBSCRIPTION_TERMS_VIEWED = "subscription_terms_viewed"
    SUBSCRIPTION_CHECKOUT_OPENED = "subscription_checkout_opened"
    SUBSCRIPTION_CHECKOUT_FAILED = "subscription_checkout_failed"
    FEEDBACK_SUBMITTED = "feedback_submitted"


class _AnalyticsProperties(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class _EmptyAnalyticsProperties(_AnalyticsProperties):
    pass


class _TabProperties(_AnalyticsProperties):
    tab: Literal["scan", "stats", "types", "receipts", "profile", "assistant"]


class _PolicyProperties(_AnalyticsProperties):
    policy: Literal["privacy", "terms"]
    version: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9._-]+$")


class _AiActionProperties(_AnalyticsProperties):
    actionId: Literal[
        "analysis", "save_money", "health", "recipe", "cart", "ingredients", "habits", "diet", "ask"
    ]


class _AiTimedProperties(_AiActionProperties):
    durationMs: int | None = Field(default=None, ge=0, le=600_000)


class _PlanProperties(_AnalyticsProperties):
    plan: Literal["budget_monthly", "premium_monthly"]


class _FailureProperties(_AnalyticsProperties):
    failureCode: Literal["network", "validation", "unavailable", "cancelled", "unknown"]


class _AiFailureProperties(_AiTimedProperties):
    failureCode: Literal["network", "validation", "unavailable", "cancelled", "unknown"]


class _ReceiptCaptureProperties(_AnalyticsProperties):
    source: Literal["qr", "image"]
    durationMs: int | None = Field(default=None, ge=0, le=600_000)


class _ReceiptCaptureFailureProperties(_ReceiptCaptureProperties):
    failureCode: Literal["network", "validation", "unavailable", "cancelled", "unknown"]


class _CheckoutFailureProperties(_PlanProperties):
    failureCode: Literal["network", "validation", "unavailable", "cancelled", "unknown"]


_ANALYTICS_PROPERTY_MODELS: dict[AnalyticsEventName, type[_AnalyticsProperties]] = {
    AnalyticsEventName.TAB_VIEWED: _TabProperties,
    AnalyticsEventName.POLICY_ACCEPTED: _PolicyProperties,
    AnalyticsEventName.AI_ACTION_STARTED: _AiActionProperties,
    AnalyticsEventName.AI_ACTION_SUCCEEDED: _AiTimedProperties,
    AnalyticsEventName.AI_ACTION_FAILED: _AiFailureProperties,
    AnalyticsEventName.SUBSCRIPTION_PLAN_SELECTED: _PlanProperties,
    AnalyticsEventName.SUBSCRIPTION_CHECKOUT_OPENED: _PlanProperties,
    AnalyticsEventName.REGISTRATION_FAILED: _FailureProperties,
    AnalyticsEventName.LOGIN_FAILED: _FailureProperties,
    AnalyticsEventName.RECEIPT_CAPTURE_STARTED: _ReceiptCaptureProperties,
    AnalyticsEventName.RECEIPT_CAPTURE_SUCCEEDED: _ReceiptCaptureProperties,
    AnalyticsEventName.RECEIPT_CAPTURE_FAILED: _ReceiptCaptureFailureProperties,
    AnalyticsEventName.SUBSCRIPTION_CHECKOUT_FAILED: _CheckoutFailureProperties,
}


class AnalyticsEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    eventId: str = Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    eventName: AnalyticsEventName
    occurredAt: datetime
    sessionId: str | None = Field(default=None, max_length=96, pattern=r"^[A-Za-z0-9_-]+$")
    properties: dict[str, Any] = Field(default_factory=dict, max_length=4)

    @field_validator("occurredAt")
    @classmethod
    def _occurred_at_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("occurredAt must include a UTC offset")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def _validate_properties(self):
        model = _ANALYTICS_PROPERTY_MODELS.get(self.eventName, _EmptyAnalyticsProperties)
        self.properties = model.model_validate(self.properties).model_dump()
        return self


class AnalyticsEventsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    installationId: str = Field(min_length=16, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    platform: Literal["ios", "android"]
    appVersion: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._+-]+$")
    appBuild: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9._-]+$")
    osVersion: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._ -]+$")
    locale: str = Field(min_length=2, max_length=16, pattern=r"^[a-z]{2,3}(?:-[A-Z]{2})?$")
    timezone: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^(?:UTC|[A-Za-z0-9_.+-]+(?:/[A-Za-z0-9_.+-]+){1,2})$",
    )
    events: list[AnalyticsEventRequest] = Field(min_length=1, max_length=50)


class AnalyticsPreferenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    installationId: str = Field(min_length=16, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    enabled: StrictBool


class AnalyticsIngestResponse(BaseModel):
    accepted: bool
    inserted: int


class AnalyticsPreferenceResponse(BaseModel):
    enabled: bool


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
    matched_by: str  # "exact", "alias", "fuzzy", "ai"
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
