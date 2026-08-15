"""
Product Matching Pipeline.

Алгоритм распознавания продуктов из сырых названий (из чеков, ручного ввода):
1. Поиск ранее подтверждённого GTIN
2. Нормализация и строгое совпадение по alias/имени
3. Структурированный AI fallback для неизвестного названия
4. Сохранение уверенного результата, alias, тега и GTIN
"""

import hashlib
import json
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from aiohttp import ClientError
from sqlalchemy import inspect, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.ai_service import AiServiceError, describe_unknown_product
from src.config import PRODUCT_FUZZY_CANDIDATE_LIMIT
from src.integrations.product_classifier import ProductClassifierError, classify_product_category
from src.models import Product, ProductAlias, ProductBarcode, ProductTag, ProductTagMember
from src.product_categories import CANONICAL_CATEGORIES, normalize_category
from src.product_names import normalize_name

CATEGORIES = CANONICAL_CATEGORIES


# Порог fuzzy-поиска каталога; fuzzy не используется для категоризации.
FUZZY_THRESHOLD_EXACT = 90  # точное совпадение (thefuzz ratio)
FUZZY_THRESHOLD_PARTIAL = 80  # частичное совпадение
FUZZY_THRESHOLD_TOKEN = 75  # токенное совпадение (для "молоко 2.5%" vs "молоко 3.2%")


def compute_context_hash(user_id: str, action: str, data: dict[str, Any]) -> str:
    """
    Вычисление хеша контекста для кэширования AI-ответов.
    data — агрегированные данные пользователя (id продуктов, количества, рецепты и т.д.)
    """
    canonical = _canonicalize(data)
    raw = f"{user_id}:{action}:{json.dumps(canonical, sort_keys=True, ensure_ascii=False)}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonicalize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


async def find_product_by_alias(db: AsyncSession, normalized: str) -> Product | None:
    """Поиск по алиасам (точное совпадение)."""
    result = await db.execute(select(ProductAlias).where(ProductAlias.alias == normalized).limit(1))
    alias = result.scalar_one_or_none()
    if not alias:
        return None
    # Загружаем продукт со всеми связями
    product_result = await db.execute(
        select(Product)
        .where(Product.id == alias.product_id)
        .options(
            selectinload(Product.aliases),
            selectinload(Product.tags).selectinload(ProductTagMember.tag),
        )
        .limit(1)
    )
    return product_result.scalar_one_or_none()


async def find_product_by_gtin(db: AsyncSession, gtin: str) -> Product | None:
    result = await db.execute(
        select(Product)
        .join(ProductBarcode)
        .where(ProductBarcode.gtin == gtin)
        .options(
            selectinload(Product.aliases),
            selectinload(Product.tags).selectinload(ProductTagMember.tag),
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def find_product_by_name(db: AsyncSession, normalized: str) -> Product | None:
    """Поиск по точному имени продукта."""
    result = await db.execute(
        select(Product).options(
            selectinload(Product.aliases),
            selectinload(Product.tags).selectinload(ProductTagMember.tag),
        )
    )
    normalized = normalize_name(normalized)
    return next(
        (product for product in result.scalars() if normalize_name(product.name) == normalized),
        None,
    )


async def find_products_fuzzy(db: AsyncSession, normalized: str, limit: int = 5) -> list[Product]:
    """
    Нечеткий поиск продуктов.
    Использует SQL LIKE для первичной фильтрации + thefuzz для ранжирования.
    """
    from thefuzz import fuzz

    tokens = [token for token in normalized.split() if len(token) >= 3][:3]
    candidate_filters = [
        condition
        for token in tokens
        for condition in (
            Product.name.ilike(f"%{token}%"),
            ProductAlias.alias.ilike(f"%{token}%"),
        )
    ]
    if not candidate_filters:
        candidate_filters = [Product.name.ilike(f"{normalized[:1]}%")]

    result = await db.execute(
        select(Product)
        .outerjoin(ProductAlias)
        .where(or_(*candidate_filters))
        .distinct()
        .options(
            selectinload(Product.aliases),
            selectinload(Product.tags).selectinload(ProductTagMember.tag),
        )
        .limit(PRODUCT_FUZZY_CANDIDATE_LIMIT)
    )
    candidates = result.scalars().all()
    if not candidates:
        prefix = normalized[:3]
        fallback = await db.execute(
            select(Product)
            .outerjoin(ProductAlias)
            .where(
                or_(
                    Product.name.ilike(f"{prefix}%"),
                    ProductAlias.alias.ilike(f"{prefix}%"),
                )
            )
            .distinct()
            .options(
                selectinload(Product.aliases),
                selectinload(Product.tags).selectinload(ProductTagMember.tag),
            )
            .limit(PRODUCT_FUZZY_CANDIDATE_LIMIT)
        )
        candidates = fallback.scalars().all()

    scored: list[tuple[int, Product]] = []

    for product in candidates:
        # Сравниваем с именем продукта
        name_score = max(
            fuzz.ratio(normalized, product.name),
            fuzz.partial_ratio(normalized, product.name),
            fuzz.token_sort_ratio(normalized, product.name),
        )

        # Сравниваем с алиасами
        alias_score = 0
        for alias in product.aliases or []:
            alias_score = max(
                alias_score,
                fuzz.ratio(normalized, alias.alias),
                fuzz.partial_ratio(normalized, alias.alias),
                fuzz.token_sort_ratio(normalized, alias.alias),
            )

        best_score = max(name_score, alias_score)
        if best_score >= FUZZY_THRESHOLD_TOKEN:
            scored.append((best_score, product))

    # Сортируем по убыванию score
    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:limit]]


async def _ensure_product_relations(db: AsyncSession, product: Product) -> None:
    """Загрузка необходимых связей для Product."""

    unloaded = inspect(product).unloaded
    relations = [name for name in ("aliases", "tags") if name in unloaded]
    if relations:
        await db.refresh(product, relations)


async def _ai_match_product(
    raw_name: str,
    normalized: str,
    gtin: str | None,
) -> dict[str, Any] | None:
    """Return validated category plus optional nutrition for an unknown item."""
    try:
        category_data = await classify_product_category(raw_name, gtin)
    except ProductClassifierError:
        return None
    result: dict[str, Any] = dict(category_data)
    try:
        details = _try_parse_ai_json(await describe_unknown_product(raw_name, normalized))
    except (AiServiceError, ClientError, OSError, RuntimeError, TimeoutError):
        details = None
    if details:
        result["nutrition_data"] = {
            key: details.get(key)
            for key in (
                "calories",
                "proteins",
                "fats",
                "carbs",
                "fiber",
                "sugar",
                "saturated_fats",
                "sodium",
                "cholesterol",
                "vitamin_a",
                "vitamin_c",
                "vitamin_d",
                "calcium",
                "iron",
                "potassium",
                "magnesium",
                "serving_size",
                "serving_unit",
            )
        }
        result["tags"] = [str(tag) for tag in details.get("tags", []) or []]
    return result


def _try_parse_ai_json(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


async def _complete_match(
    db: AsyncSession,
    product: Product,
    confidence: float,
    matched_by: str,
    alternatives: list[Product],
    gtin: str | None,
) -> dict[str, Any]:
    await _ensure_product_relations(db, product)
    product.category = normalize_category(product.category)
    if gtin and await db.get(ProductBarcode, gtin) is None:
        db.add(ProductBarcode(gtin=gtin, product_id=product.id))
    return _build_result(product, confidence, matched_by, alternatives)


async def match_product(
    db: AsyncSession,
    raw_name: str,
    quantity: float = 1,
    unit: str | None = None,
    user_id: str | None = None,
    gtin: str | None = None,
) -> dict[str, Any]:
    """
    Основной pipeline распознавания продукта.
    Возвращает dict с результатом.
    """
    normalized = normalize_name(raw_name)

    if gtin:
        product = await find_product_by_gtin(db, gtin)
        if product:
            return await _complete_match(db, product, 1.0, "gtin", [], gtin)

    # Шаг 1: Точный поиск по алиасам
    product = await find_product_by_alias(db, normalized)
    if product:
        return await _complete_match(db, product, 1.0, "alias", [], gtin)

    # Шаг 2: Точный поиск по имени
    product = await find_product_by_name(db, normalized)
    if product:
        return await _complete_match(db, product, 1.0, "exact", [], gtin)

    # Unknown names are classified only for an authenticated receipt request.
    ai_data: dict[str, Any] = {}
    confidence = 0.0
    category = None
    matched_by = "none"
    if user_id:
        ai_data = await _ai_match_product(raw_name, normalized, gtin)
        if ai_data and float(ai_data["confidence"]) >= 0.8:
            category = normalize_category(str(ai_data["category"]))
            confidence = float(ai_data["confidence"])
            matched_by = "ai"

    if category is not None:
        product = await save_new_product(
            db=db,
            name=normalized,
            raw_alias=raw_name,
            nutrition_data=ai_data.get("nutrition_data", {}),
            tags=[category, *ai_data.get("tags", [])],
            category=category,
            gtin=gtin,
        )
        await _ensure_product_relations(db, product)
        return _build_result(product, confidence, matched_by, [])

    # Ничего не найдено
    return {
        "product": None,
        "confidence": 0.0,
        "matched_by": "none",
        "alternatives": [],
        "normalized_name": normalized,
    }


def _build_result(
    product: Product,
    confidence: float,
    matched_by: str,
    alternatives: list[Product],
) -> dict[str, Any]:
    """Формирование результата распознавания."""
    return {
        "product": product,
        "confidence": confidence,
        "matched_by": matched_by,
        "alternatives": alternatives,
        "normalized_name": product.name,
    }


async def save_new_product(
    db: AsyncSession,
    name: str,
    raw_alias: str,
    nutrition_data: dict[str, Any],
    tags: list[str] | None = None,
    category: str = "прочее",
    gtin: str | None = None,
) -> Product:
    """
    Сохранение нового продукта после AI-распознавания.
    Создаёт Product + ProductAlias + теги.
    """
    normalized_name = normalize_name(name)

    product = Product(
        name=normalized_name,
        normalized_name=normalized_name,
        category=normalize_category(category),
        calories=nutrition_data.get("calories", 0),
        proteins=nutrition_data.get("proteins", 0),
        fats=nutrition_data.get("fats", 0),
        carbs=nutrition_data.get("carbs", 0),
        fiber=nutrition_data.get("fiber"),
        sugar=nutrition_data.get("sugar"),
        saturated_fats=nutrition_data.get("saturated_fats"),
        sodium=nutrition_data.get("sodium"),
        cholesterol=nutrition_data.get("cholesterol"),
        vitamin_a=nutrition_data.get("vitamin_a"),
        vitamin_c=nutrition_data.get("vitamin_c"),
        vitamin_d=nutrition_data.get("vitamin_d"),
        calcium=nutrition_data.get("calcium"),
        iron=nutrition_data.get("iron"),
        potassium=nutrition_data.get("potassium"),
        magnesium=nutrition_data.get("magnesium"),
        serving_size=nutrition_data.get("serving_size"),
        serving_unit=nutrition_data.get("serving_unit"),
    )
    db.add(product)
    await db.flush()  # чтобы получить id

    # Создаём алиас из сырого названия
    alias = ProductAlias(
        product_id=product.id,
        alias=normalize_name(raw_alias),
    )
    db.add(alias)
    if gtin:
        db.add(ProductBarcode(gtin=gtin, product_id=product.id))

    # Добавляем теги
    if tags:
        for tag_name in tags:
            tag_result = await db.execute(
                select(ProductTag).where(ProductTag.name == tag_name).limit(1)
            )
            tag = tag_result.scalar_one_or_none()
            if not tag:
                tag = ProductTag(name=tag_name)
                db.add(tag)
                await db.flush()

            member = ProductTagMember(
                product_id=product.id,
                tag_id=tag.id,
                weight=1.0,
            )
            db.add(member)

    await db.refresh(product)
    return product


async def compute_similarity_matrix(db: AsyncSession) -> None:
    """
    Вычисление similarity_score для всех пар продуктов на основе нутриентов.
    Запускается периодически или после добавления новых продуктов.
    """
    import numpy as np

    result = await db.execute(select(Product))
    products = result.scalars().all()

    if len(products) < 2:
        return

    # Собираем векторы нутриентов
    nutrient_keys = [
        "calories",
        "proteins",
        "fats",
        "carbs",
        "fiber",
        "sugar",
        "saturated_fats",
        "sodium",
    ]
    vectors: list[list[float]] = []
    for p in products:
        vec = [getattr(p, key) or 0.0 for key in nutrient_keys]
        vectors.append(vec)

    vectors_np = np.array(vectors, dtype=float)

    # Нормализация (min-max scaling)
    mins = vectors_np.min(axis=0)
    maxs = vectors_np.max(axis=0)
    ranges = maxs - mins
    ranges[ranges == 0] = 1  # избегаем деления на 0
    normalized = (vectors_np - mins) / ranges

    # Косинусная близость
    norms = np.linalg.norm(normalized, axis=1, keepdims=True)
    norms[norms == 0] = 1
    similarity = (normalized @ normalized.T) / (norms @ norms.T)

    # Сохраняем/обновляем substitutes
    for i, p1 in enumerate(products):
        for j, p2 in enumerate(products):
            if i >= j:
                continue
            score = float(similarity[i][j])
            if score < 0.3:  # порог минимальной похожести
                continue

            # Проверяем, есть ли уже такая связь
            existing = await db.execute(
                select(ProductSubstitute)
                .where(
                    ProductSubstitute.product_id == p1.id,
                    ProductSubstitute.substitute_product_id == p2.id,
                )
                .limit(1)
            )
            if existing.scalar_one_or_none():
                continue

            sub = ProductSubstitute(
                product_id=p1.id,
                substitute_product_id=p2.id,
                similarity_score=score,
                ratio=1.0,
            )
            db.add(sub)

    await db.commit()


# Импорт для compute_similarity_matrix
from src.models import ProductSubstitute  # noqa: E402
