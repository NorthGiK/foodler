"""
Product Matching Pipeline.

Алгоритм распознавания продуктов из сырых названий (из чеков, ручного ввода):
1. Нормализация названия
2. Точный поиск по алиасам
3. Точный поиск по имени продукта
4. Нечеткий поиск (FTS + thefuzz)
5. AI fallback (если ничего не найдено)
6. Авто-сохранение нового продукта + алиаса
"""

import hashlib
import json
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models import Product, ProductAlias, ProductTag, ProductTagMember


# Минимальный порог схожести для fuzzy matching
FUZZY_THRESHOLD_EXACT = 90  # точное совпадение (thefuzz ratio)
FUZZY_THRESHOLD_PARTIAL = 80  # частичное совпадение
FUZZY_THRESHOLD_TOKEN = 75  # токенное совпадение (для "молоко 2.5%" vs "молоко 3.2%")


def normalize_name(name: str) -> str:
    """Нормализация названия продукта."""
    name = name.lower().strip()
    # Удаление лишних пробелов
    name = re.sub(r"\s+", " ", name)
    # Удаление спецсимволов (оставляем буквы, цифры, пробелы, %, ., -, /)
    name = re.sub(r"[^\w\s%.\\/\-]", "", name)
    return name.strip()


def compute_context_hash(user_id: str, action: str, data: dict[str, Any]) -> str:
    """
    Вычисление хеша контекста для кэширования AI-ответов.
    data — агрегированные данные пользователя (id продуктов, количества, рецепты и т.д.)
    """
    raw = f"{user_id}:{action}:{json.dumps(data, sort_keys=True, ensure_ascii=False)}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def find_product_by_alias(db: AsyncSession, normalized: str) -> Product | None:
    """Поиск по алиасам (точное совпадение)."""
    result = await db.execute(
        select(ProductAlias).where(ProductAlias.alias == normalized).limit(1)
    )
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


async def find_product_by_name(db: AsyncSession, normalized: str) -> Product | None:
    """Поиск по точному имени продукта."""
    result = await db.execute(
        select(Product)
        .where(Product.name == normalized)
        .options(
            selectinload(Product.aliases),
            selectinload(Product.tags).selectinload(ProductTagMember.tag),
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def find_products_fuzzy(
    db: AsyncSession, normalized: str, limit: int = 5
) -> list[Product]:
    """
    Нечеткий поиск продуктов.
    Использует SQL LIKE для первичной фильтрации + thefuzz для ранжирования.
    """
    from thefuzz import fuzz

    # Получаем все продукты (для небольшой БД это ок, для большой — нужен FTS5)
    # Загружаем все связи сразу, чтобы избежать MissingGreenlet
    result = await db.execute(
        select(Product).options(
            selectinload(Product.aliases),
            selectinload(Product.tags).selectinload(ProductTagMember.tag),
        )
    )
    all_products = result.scalars().all()

    scored: list[tuple[int, Product]] = []

    for product in all_products:
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

    # Проверяем, загружены ли связи
    try:
        _ = product.aliases
    except Exception:
        await db.refresh(product, ["aliases"])
    try:
        _ = product.tags
    except Exception:
        await db.refresh(product, ["tags"])


async def _ai_match_product(
    raw_name: str,
    normalized: str,
) -> dict[str, Any] | None:
    """
    AI fallback для продукта.
    Возвращает nutrition_data и tags, или None, если AI недоступен.
    """
    try:
        from src.ai_service import generate_ai_response
    except Exception:
        return None

    system = (
        "Ты — эксперт по пищевой ценности. "
        "Верни JSON с полями: product_name, calories, proteins, fats, carbs, tags (массив строк). "
        "Только JSON, без Markdown, без текста."
    )
    user = json.dumps({"raw_name": raw_name, "normalized": normalized}, ensure_ascii=False)

    try:
        raw = await generate_ai_response(
            action="product-ai-fallback",
            parameters=None,
            context={"system": system, "user": user},
        )
    except Exception:
        return None

    data = _try_parse_ai_json(raw)
    if not data:
        return None
    return data


def _try_parse_ai_json(raw: str) -> dict[str, Any] | None:
    if not raw:
        return None
    text = raw.strip()
    # Убираем возможный markdown-код ```json ... ```
    m = re.search(r"```(?:json)?(.*?)```", text, re.DOTALL)
    if m:
        text = m.group(1)
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    return None


async def match_product(
    db: AsyncSession,
    raw_name: str,
    quantity: float = 1,
    unit: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    Основной pipeline распознавания продукта.
    Возвращает dict с результатом.
    """
    normalized = normalize_name(raw_name)

    # Шаг 1: Точный поиск по алиасам
    product = await find_product_by_alias(db, normalized)
    if product:
        await _ensure_product_relations(db, product)
        return _build_result(product, 1.0, "alias", [])

    # Шаг 2: Точный поиск по имени
    product = await find_product_by_name(db, normalized)
    if product:
        await _ensure_product_relations(db, product)
        return _build_result(product, 1.0, "exact", [])

    # Шаг 3: Нечеткий поиск
    fuzzy_results = await find_products_fuzzy(db, normalized)
    if fuzzy_results:
        best = fuzzy_results[0]
        alternatives = fuzzy_results[1:]
        for p in [best, *alternatives]:
            await _ensure_product_relations(db, p)
        return _build_result(best, 0.85, "fuzzy", alternatives)

    # Шаг 4: AI fallback
    if user_id:
        ai_data = await _ai_match_product(raw_name, normalized)
        if ai_data:
            nutrition_data = {
                "calories": float(ai_data.get("calories", 0) or 0),
                "proteins": float(ai_data.get("proteins", 0) or 0),
                "fats": float(ai_data.get("fats", 0) or 0),
                "carbs": float(ai_data.get("carbs", 0) or 0),
                "fiber": ai_data.get("fiber"),
                "sugar": ai_data.get("sugar"),
                "saturated_fats": ai_data.get("saturated_fats"),
                "sodium": ai_data.get("sodium"),
                "cholesterol": ai_data.get("cholesterol"),
                "vitamin_a": ai_data.get("vitamin_a"),
                "vitamin_c": ai_data.get("vitamin_c"),
                "vitamin_d": ai_data.get("vitamin_d"),
                "calcium": ai_data.get("calcium"),
                "iron": ai_data.get("iron"),
                "potassium": ai_data.get("potassium"),
                "magnesium": ai_data.get("magnesium"),
                "serving_size": ai_data.get("serving_size"),
                "serving_unit": ai_data.get("serving_unit"),
            }
            tags = ai_data.get("tags") or []
            product_name = ai_data.get("product_name") or normalized
            # Сохраняем продукт
            product = await save_new_product(
                db=db,
                name=product_name,
                raw_alias=raw_name,
                nutrition_data=nutrition_data,
                tags=[str(t) for t in tags],
            )
            await _ensure_product_relations(db, product)
            return _build_result(product, 0.7, "ai", [])

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
) -> Product:
    """
    Сохранение нового продукта после AI-распознавания.
    Создаёт Product + ProductAlias + теги.
    """
    normalized_name = normalize_name(name)

    product = Product(
        name=normalized_name,
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

    await db.commit()
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