from __future__ import annotations

import uuid
import random
import string
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Float, Text, Integer
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.dialects.sqlite import JSON

from .database import Base
from src.schemas import FamilyMemberDict


EMAIL_CODE_LENGTH = 8
CHAR_POOL = string.ascii_letters.lower() + string.digits


def _uuid() -> str:
    return uuid.uuid4().hex


def _email_code() -> str:
    return "".join(random.choice(CHAR_POOL) for _ in range(EMAIL_CODE_LENGTH))


def _utcnow() -> datetime:
    """Return naive UTC for SQLite DateTime columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ============================================================
# Base Models
# ============================================================


class EmailCodesStorage(Base):
    __tablename__ = "email_codes_storage"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(index=True)
    code: Mapped[str] = mapped_column(default=_email_code, index=True)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(nullable=False)
    premium: Mapped[bool] = mapped_column(insert_default=False)
    subscription_expires: Mapped[datetime] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    devices: Mapped[list["Device"]] = relationship(
        "Device", back_populates="user", cascade="all, delete-orphan"
    )
    receipts: Mapped[list["Receipt"]] = relationship(
        "Receipt", back_populates="user", cascade="all, delete-orphan"
    )
    ai_reports: Mapped[list["AiReport"]] = relationship(
        "AiReport", back_populates="user", cascade="all, delete-orphan"
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    token: Mapped[str] = mapped_column(unique=True, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    user = relationship("User")


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    device_id: Mapped[str] = mapped_column(nullable=False)
    model: Mapped[str] = mapped_column(nullable=True)
    os: Mapped[str] = mapped_column(nullable=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    user: Mapped[User] = relationship("User", back_populates="devices")


class Receipt(Base):
    __tablename__ = "receipts"

    id: Mapped[str] = mapped_column(primary_key=True)
    date: Mapped[str] = mapped_column(nullable=False)  # ISO date
    store: Mapped[str] = mapped_column(nullable=True)
    total: Mapped[float] = mapped_column(nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    # Дата, после которой чек можно удалить. None = хранить бесконечно.
    receipt_expires_at: Mapped[datetime] = mapped_column(nullable=True, index=True)

    user: Mapped[User] = relationship("User", back_populates="receipts")
    items: Mapped[list[ReceiptItem]] = relationship(
        "ReceiptItem", back_populates="receipt", cascade="all, delete-orphan"
    )


class ReceiptItem(Base):
    __tablename__ = "receipt_items"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    receipt_id: Mapped[str] = mapped_column(ForeignKey("receipts.id"), nullable=False)
    name: Mapped[str] = mapped_column(nullable=False)
    quantity: Mapped[float] = mapped_column(insert_default=1)
    price: Mapped[float] = mapped_column(nullable=False)
    # Связь с продуктом (если распознан)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), nullable=True, index=True)

    receipt: Mapped[Receipt] = relationship("Receipt", back_populates="items")
    product: Mapped["Product"] = relationship("Product", back_populates="receipt_items")


class AiReport(Base):
    __tablename__ = "ai_reports"

    id: Mapped[str] = mapped_column(primary_key=True)
    action: Mapped[str] = mapped_column(nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    snapshot: Mapped[str] = mapped_column(nullable=True)  # JSON
    response: Mapped[str] = mapped_column(nullable=True)  # JSON

    user = relationship("User", back_populates="ai_reports")


class Payment(Base):
    __tablename__ = "subcription_in_process"

    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    status: Mapped[str] = mapped_column()  # in_progress | rejected | success

    user: Mapped[User] = relationship("User")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"),
        unique=True,
    )
    purchase_token: Mapped[str] = mapped_column(nullable=False)
    product_id: Mapped[str] = mapped_column(nullable=False)
    active: Mapped[bool] = mapped_column(insert_default=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    user: Mapped[User] = relationship("User")


class FamilyMembers(Base):
    __tablename__ = "family_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey(User.id), unique=True)
    members: Mapped[FamilyMemberDict] = mapped_column(JSON)


# ============================================================
# Local Knowledge Base
# ============================================================


class Product(Base):
    """
    Канонический продукт с полными данными о КБЖУ и нутриентах.
    Варианты одного продукта (например, молоко 2.5% и 3.2%) — это
    отдельные Product с parent_id, указывающим на общий корень.
    """

    __tablename__ = "products"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(unique=True, nullable=False, index=True)
    parent_id: Mapped[str] = mapped_column(ForeignKey("products.id"), nullable=True, index=True)

    # КБЖУ на 100 г/мл
    calories: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    proteins: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    fats: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    carbs: Mapped[float] = mapped_column(Float, nullable=False, default=0)

    # Дополнительные нутриенты
    fiber: Mapped[float] = mapped_column(Float, nullable=True)
    sugar: Mapped[float] = mapped_column(Float, nullable=True)
    saturated_fats: Mapped[float] = mapped_column(Float, nullable=True)
    sodium: Mapped[float] = mapped_column(Float, nullable=True)
    cholesterol: Mapped[float] = mapped_column(Float, nullable=True)

    # Витамины и минералы (мкг/мг на 100г)
    vitamin_a: Mapped[float] = mapped_column(Float, nullable=True)  # мкг
    vitamin_c: Mapped[float] = mapped_column(Float, nullable=True)  # мг
    vitamin_d: Mapped[float] = mapped_column(Float, nullable=True)  # мкг
    calcium: Mapped[float] = mapped_column(Float, nullable=True)  # мг
    iron: Mapped[float] = mapped_column(Float, nullable=True)  # мг
    potassium: Mapped[float] = mapped_column(Float, nullable=True)  # мг
    magnesium: Mapped[float] = mapped_column(Float, nullable=True)  # мг

    # Мета
    serving_size: Mapped[float] = mapped_column(Float, nullable=True)  # г/мл
    serving_unit: Mapped[str] = mapped_column(nullable=True)  # "г", "мл", "шт"
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    # Relationships
    parent: Mapped["Product | None"] = relationship(
        "Product", remote_side="Product.id", back_populates="variants"
    )
    variants: Mapped[list["Product"]] = relationship(
        "Product", back_populates="parent", cascade="all, delete-orphan"
    )
    aliases: Mapped[list["ProductAlias"]] = relationship(
        "ProductAlias", back_populates="product", cascade="all, delete-orphan"
    )
    tags: Mapped[list["ProductTagMember"]] = relationship(
        "ProductTagMember", back_populates="product", cascade="all, delete-orphan"
    )
    substitutes_from: Mapped[list["ProductSubstitute"]] = relationship(
        "ProductSubstitute",
        foreign_keys="ProductSubstitute.product_id",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    substitutes_to: Mapped[list["ProductSubstitute"]] = relationship(
        "ProductSubstitute",
        foreign_keys="ProductSubstitute.substitute_product_id",
        back_populates="substitute_product",
        cascade="all, delete-orphan",
    )
    receipt_items: Mapped[list["ReceiptItem"]] = relationship(
        "ReceiptItem", back_populates="product"
    )
    recipe_ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        "RecipeIngredient", back_populates="product"
    )


class ProductAlias(Base):
    """
    Синонимы/альтернативные названия продукта.
    Решает проблему "бульмени" → "пельмени".
    """

    __tablename__ = "product_aliases"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    alias: Mapped[str] = mapped_column(nullable=False, index=True)
    language: Mapped[str] = mapped_column(insert_default="ru")

    product: Mapped["Product"] = relationship("Product", back_populates="aliases")


class ProductTag(Base):
    """
    Гибкие теги для продуктов (many-to-many).
    Пример: "творог", "кисломолочка", "сладость", "белок".
    Может иметь иерархию через parent_id.
    """

    __tablename__ = "product_tags"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(unique=True, nullable=False, index=True)
    parent_id: Mapped[str] = mapped_column(ForeignKey("product_tags.id"), nullable=True)

    parent: Mapped["ProductTag"] = relationship(
        "ProductTag", remote_side="ProductTag.id", back_populates="children"
    )
    children: Mapped[list["ProductTag"]] = relationship(
        "ProductTag", back_populates="parent", cascade="all, delete-orphan"
    )
    members: Mapped[list["ProductTagMember"]] = relationship(
        "ProductTagMember", back_populates="tag", cascade="all, delete-orphan"
    )


class ProductTagMember(Base):
    """Связь продукта с тегом + вес соответствия."""

    __tablename__ = "product_tag_members"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    tag_id: Mapped[str] = mapped_column(ForeignKey("product_tags.id"), nullable=False, index=True)
    weight: Mapped[float] = mapped_column(Float, insert_default=1.0)  # 0.0-1.0

    product: Mapped["Product"] = relationship("Product", back_populates="tags")
    tag: Mapped["ProductTag"] = relationship("ProductTag", back_populates="members")


class ProductSubstitute(Base):
    """
    Аналоги продуктов с коэффициентом похожести.
    Вычисляется автоматически по нутриентам или задаётся вручную.
    """

    __tablename__ = "product_substitutes"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    substitute_product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id"), nullable=False, index=True
    )
    similarity_score: Mapped[float] = mapped_column(Float, insert_default=0.5)  # 0.0-1.0
    ratio: Mapped[float] = mapped_column(Float, insert_default=1.0)  # коэффициент замены
    notes: Mapped[str] = mapped_column(nullable=True)

    product: Mapped["Product"] = relationship(
        "Product", foreign_keys=[product_id], back_populates="substitutes_from"
    )
    substitute_product: Mapped["Product"] = relationship(
        "Product", foreign_keys=[substitute_product_id], back_populates="substitutes_to"
    )


class Recipe(Base):
    """
    Рецепт. Связан с ингредиентами через many-to-many (RecipeIngredient).
    """

    __tablename__ = "recipes"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(nullable=False, index=True)
    instructions: Mapped[str] = mapped_column(Text, nullable=True)  # JSON-массив шагов
    cooking_time_minutes: Mapped[int] = mapped_column(Integer, nullable=True)
    tags: Mapped[str] = mapped_column(nullable=True)  # JSON array тегов
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        "RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan"
    )


class RecipeIngredient(Base):
    """
    Ингредиент рецепта (many-to-many связь Recipe <-> Product).
    importance_score: 0.0 = можно исключить, 0.5 = желательно, 1.0 = обязательно.
    """

    __tablename__ = "recipe_ingredients"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    recipe_id: Mapped[str] = mapped_column(ForeignKey("recipes.id"), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(nullable=False)  # "г", "мл", "шт", "ст.л", "ч.л"
    importance_score: Mapped[float] = mapped_column(Float, insert_default=1.0)  # 0.0-1.0
    substitute_ids: Mapped[str] = mapped_column(nullable=True)  # JSON array of Product IDs

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="ingredients")
    product: Mapped["Product"] = relationship("Product", back_populates="recipe_ingredients")


class AiCache(Base):
    """
    Кэш AI-ответов. Ключ = (action + context_hash + question_hash).
    context_hash вычисляется из агрегированных данных пользователя.
    """

    __tablename__ = "ai_cache"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(nullable=False, index=True)
    context_hash: Mapped[str] = mapped_column(nullable=False, index=True)
    question_hash: Mapped[str] = mapped_column(nullable=True)  # только для action="ask"
    response: Mapped[str] = mapped_column(Text, nullable=False)  # JSON
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)


class AiCreditUsage(Base):
    """
    Использование AI кредитов.
    Для авторизованных: per-day. Для неавторизованных: per-week/per-month.
    """

    __tablename__ = "ai_credit_usage"

    id: Mapped[str] = mapped_column(primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )  # None = аноним
    ip_hash: Mapped[str] = mapped_column(nullable=True, index=True)
    action: Mapped[str] = mapped_column(nullable=False)
    credits: Mapped[float] = mapped_column(Float, nullable=False, insert_default=1.0)
    created_at: Mapped[datetime] = mapped_column(insert_default=_utcnow)


class AiCreditBalance(Base):
    """Atomic credit counter for one identity and billing period."""

    __tablename__ = "ai_credit_balances"
    __table_args__ = (
        CheckConstraint("used >= 0", name="ck_ai_credit_balance_used_nonnegative"),
        CheckConstraint("used <= period_limit", name="ck_ai_credit_balance_within_limit"),
    )

    bucket_key: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    ip_hash: Mapped[str | None] = mapped_column(nullable=True, index=True)
    period_start: Mapped[datetime] = mapped_column(nullable=False)
    period_end: Mapped[datetime] = mapped_column(nullable=False)
    period_limit: Mapped[float] = mapped_column(Float, nullable=False)
    used: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=_utcnow, onupdate=_utcnow)


class AiResponse(Base):
    __tablename__ = "ai_response"

    id: Mapped[int] = mapped_column(primary_key=True)
    action: Mapped[str] = mapped_column()
    ai_response: Mapped[str | None] = mapped_column(nullable=True)
