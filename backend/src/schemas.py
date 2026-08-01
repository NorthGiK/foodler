from __future__ import annotations

from datetime import datetime
from typing import Any, TypedDict, Literal

from pydantic import BaseModel, EmailStr


# --- Auth ---


class SendCodeRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str
    password: str | None = None


class ForgotPasswordVerify(BaseModel):
    email: EmailStr
    code: str
    new_password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


LoginRequest = RegisterRequest


class RefreshRequest(BaseModel):
    refreshToken: str


class AuthResponse(BaseModel):
    accessToken: str
    refreshToken: str
    user: "UserResponse"


class UserResponse(BaseModel):
    id: str
    email: str
    premium: bool
    subscriptionExpires: datetime | None = None


class ForgotPassword(BaseModel):
    email: EmailStr


class FeedbackRequest(BaseModel):
    email: EmailStr
    text: str
    images: list[str] = []  # base64-encoded images


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


class ReceiptJsonData(BaseModel):
    ticketDate: str
    operationType: int
    totalSum: int
    user: str
    items: list["ReceiptItemSchema"]


class ReceiptResponseData(TypedDict):
    json: ReceiptJsonData


class ReceiptRawResponseSchema(BaseModel):
    code: int
    data: ReceiptResponseData | None


class GetReceiptFromQRSchema(BaseModel):
    qrraw: str


class GetReceiptFromRawQRSchema(BaseModel):
    qrfile: str  # base64


class ReceiptItemSchema(BaseModel):
    name: str
    quantity: float = 1
    price: float
    sum: float | None = None
    product_id: str | None = None  # связь с Product после распознавания


class ReceiptSchema(BaseModel):
    id: str
    date: str
    store: str | None = None
    total: float
    items: list[ReceiptItemSchema] = []


class ReceiptSchemaArray(BaseModel):
    receipts: list[ReceiptSchema] | None = None


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
    text: str


class AiRequestParameters(BaseModel):
    periodFrom: str | None = None
    periodTo: str | None = None
    question: str | None = None
    history: list[AiHistoryItem] | None = None
    members: list[FamilyMember] | None = None


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


class GooglePurchase(BaseModel):
    purchaseToken: str
    productId: str


class CreatePaymentRequest(BaseModel):
    """Request to create a payment via YooKassa.

    paymentMethod values: bank_card, sbp, sberbank, tinkoff_bank, yoo_money
    If None, YooKassa will show all available payment methods.
    """

    paymentMethod: Literal["bank_card", "sbp", "sberbank", "tinkoff_bank", "yoo_money"] | None = (
        None
    )


class PremiumStatusResponse(BaseModel):
    premium: bool


class PaymentConfirmationResponse(BaseModel):
    confirmationUrl: str


class SubscriptionStatusResponse(BaseModel):
    active: bool
    platform: Literal["yookassa", "google"] | None
    expiresAt: datetime | None


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
