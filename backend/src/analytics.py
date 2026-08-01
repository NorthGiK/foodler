"""
Локальная аналитика — расчёты без AI.

Содержит функции для:
- Агрегации трат по периодам
- Расчёта КБЖУ по купленным продуктам
- Прогноза остатков в холодильнике
- Поиска рецептов по доступным продуктам
- Расчёта similarity_score между продуктами
"""

import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models import (
    AiCache,
    Product,
    ProductSubstitute,
    ProductTag,
    ProductTagMember,
    Recipe,
    RecipeIngredient,
    Receipt,
    ReceiptItem,
)
from src.utils import parse_date

logger = logging.getLogger("analytics")


def _utcnow() -> datetime:
    """Timezone-safe UTC now."""
    return datetime.now(timezone.utc)


# ============================================================
# Spending Analysis
# ============================================================


async def get_spending_summary(
    db: AsyncSession,
    user_id: str,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict[str, Any]:
    """Агрегация трат пользователя за период."""
    query = select(Receipt).where(Receipt.user_id == user_id).options(selectinload(Receipt.items))
    if from_date:
        query = query.where(Receipt.date >= from_date)
    if to_date:
        query = query.where(Receipt.date <= to_date)

    result = await db.execute(query.order_by(Receipt.date.asc()))
    receipts = list(result.scalars().all())

    if not receipts:
        return {
            "receipt_count": 0,
            "total_spent": 0,
            "avg_receipt": 0,
            "by_month": [],
            "by_store": [],
        }

    total = sum(r.total for r in receipts)
    count = len(receipts)

    # По месяцам
    monthly: dict[str, float] = defaultdict(float)
    for r in receipts:
        month_key = r.date[:7]  # "2024-01"
        monthly[month_key] += r.total

    # По магазинам
    by_store: dict[str, float] = defaultdict(float)
    for r in receipts:
        store = r.store or "Другой"
        by_store[store] += r.total

    return {
        "receipt_count": count,
        "total_spent": round(total, 2),
        "avg_receipt": round(total / count, 2) if count else 0,
        "by_month": [{"month": k, "total": round(v, 2)} for k, v in sorted(monthly.items())],
        "by_store": [
            {"store": k, "total": round(v, 2)}
            for k, v in sorted(by_store.items(), key=lambda x: -x[1])
        ],
    }


# ============================================================
# Nutrition Analysis
# ============================================================


async def get_nutrition_summary(
    db: AsyncSession,
    user_id: str,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict[str, Any]:
    """
    Расчёт КБЖУ и нутриентов по купленным продуктам за период.
    Считает по продуктам, привязанным к чекам (ReceiptItem.product_id).
    """
    query = (
        select(ReceiptItem)
        .join(Receipt)
        .where(Receipt.user_id == user_id)
        .options(selectinload(ReceiptItem.product))
    )
    if from_date:
        query = query.where(Receipt.date >= from_date)
    if to_date:
        query = query.where(Receipt.date <= to_date)

    result = await db.execute(query)
    items = result.scalars().all()

    if not items:
        return {
            "period_from": from_date or "",
            "period_to": to_date or "",
            "total_calories": 0,
            "total_proteins": 0,
            "total_fats": 0,
            "total_carbs": 0,
            "avg_daily_calories": 0,
            "avg_daily_proteins": 0,
            "avg_daily_fats": 0,
            "avg_daily_carbs": 0,
            "by_tag": [],
        }

    totals = {
        "calories": 0.0,
        "proteins": 0.0,
        "fats": 0.0,
        "carbs": 0.0,
        "fiber": 0.0,
        "sugar": 0.0,
        "saturated_fats": 0.0,
        "sodium": 0.0,
    }

    # По тегам
    by_tag: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for item in items:
        product = item.product
        if not product:
            continue

        # Количество в граммах (предполагаем, что quantity в кг, если не указано иное)
        grams = item.quantity * 1000  # конвертируем кг в г
        factor = grams / 100.0  # на 100г

        totals["calories"] += product.calories * factor
        totals["proteins"] += product.proteins * factor
        totals["fats"] += product.fats * factor
        totals["carbs"] += product.carbs * factor
        if product.fiber:
            totals["fiber"] += product.fiber * factor
        if product.sugar:
            totals["sugar"] += product.sugar * factor
        if product.saturated_fats:
            totals["saturated_fats"] += product.saturated_fats * factor
        if product.sodium:
            totals["sodium"] += product.sodium * factor

        # По тегам — используем прямой SQL запрос, чтобы избежать MissingGreenlet
        _tag_result = await db.execute(
            select(ProductTag.name)
            .join(ProductTagMember, ProductTagMember.tag_id == ProductTag.id)
            .where(ProductTagMember.product_id == product.id)
        )
        for (tag_name,) in _tag_result.all():
            by_tag[tag_name]["calories"] += product.calories * factor
            by_tag[tag_name]["proteins"] += product.proteins * factor
            by_tag[tag_name]["fats"] += product.fats * factor
            by_tag[tag_name]["carbs"] += product.carbs * factor

    # Количество дней в периоде
    if from_date and to_date:
        start = parse_date(from_date)
        end = parse_date(to_date)
        days = max((end - start).days, 1)
    else:
        days = 1

    return {
        "period_from": from_date or "",
        "period_to": to_date or "",
        "total_calories": round(totals["calories"], 1),
        "total_proteins": round(totals["proteins"], 1),
        "total_fats": round(totals["fats"], 1),
        "total_carbs": round(totals["carbs"], 1),
        "total_fiber": round(totals["fiber"], 1),
        "total_sugar": round(totals["sugar"], 1),
        "total_saturated_fats": round(totals["saturated_fats"], 1),
        "total_sodium": round(totals["sodium"], 1),
        "avg_daily_calories": round(totals["calories"] / days, 1),
        "avg_daily_proteins": round(totals["proteins"] / days, 1),
        "avg_daily_fats": round(totals["fats"] / days, 1),
        "avg_daily_carbs": round(totals["carbs"] / days, 1),
        "by_tag": [
            {
                "tag": tag_name,
                "calories": round(v["calories"], 1),
                "proteins": round(v["proteins"], 1),
                "fats": round(v["fats"], 1),
                "carbs": round(v["carbs"], 1),
            }
            for tag_name, v in sorted(by_tag.items(), key=lambda x: -x[1]["calories"])
        ],
    }


# ============================================================
# Fridge / Stock Prediction
# ============================================================

# Дефолтные сроки хранения продуктов (в днях) по тегам
DEFAULT_EXPIRY_DAYS: dict[str, int] = {
    "молочка": 7,
    "мясо": 5,
    "рыба": 3,
    "овощи": 10,
    "фрукты": 7,
    "хлеб": 5,
    "яйца": 21,
    "напитки": 30,
    "бакалея": 180,
    "заморозка": 180,
    "сладость": 60,
    "соус": 60,
}

DEFAULT_CONSUMPTION_DAYS = 7  # если неизвестна норма потребления


async def get_fridge_status(
    db: AsyncSession,
    user_id: str,
) -> list[dict[str, Any]]:
    """
    Прогноз остатков в холодильнике на основе истории покупок.
    Анализирует регулярность покупок каждого продукта.
    """
    # Получаем все чеки пользователя с товарами
    result = await db.execute(
        select(Receipt)
        .where(Receipt.user_id == user_id)
        .options(selectinload(Receipt.items).selectinload(ReceiptItem.product))
        .order_by(Receipt.date.desc())
    )
    receipts = result.scalars().all()

    if not receipts:
        return []

    # Собираем историю покупок по продуктам
    # product_id -> [(date, quantity)]
    purchase_history: dict[str, list[tuple[str, float]]] = defaultdict(list)
    product_cache: dict[str, Product] = {}

    for receipt in receipts:
        for item in receipt.items or []:
            if not item.product_id:
                continue
            purchase_history[item.product_id].append((receipt.date, item.quantity))
            if item.product_id not in product_cache and item.product:
                product_cache[item.product_id] = item.product

    fridge: list[dict[str, Any]] = []

    now = _utcnow()

    for product_id, purchases in purchase_history.items():
        product = product_cache.get(product_id)
        if not product:
            continue

        # Сортируем по дате (от новых к старым)
        purchases.sort(key=lambda x: x[0], reverse=True)

        # Последняя покупка
        last_date_str, last_qty = purchases[0]
        try:
            last_date: datetime = (
                datetime.fromisoformat(last_date_str)
                if isinstance(last_date_str, str)
                else last_date_str
            )
            # Make timezone-aware if needed
            if last_date.tzinfo is None:
                last_date = last_date.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            logger.warning("Failed to parse date %s for product %s", last_date_str, product_id)
            continue
        days_since_purchase = (now - last_date).days

        # Средний интервал между покупками
        if len(purchases) >= 2:
            intervals = []
            for i in range(len(purchases) - 1):
                try:
                    d1 = datetime.fromisoformat(purchases[i][0])
                    d2 = datetime.fromisoformat(purchases[i + 1][0])
                    if d1.tzinfo is None:
                        d1 = d1.replace(tzinfo=timezone.utc)
                    if d2.tzinfo is None:
                        d2 = d2.replace(tzinfo=timezone.utc)
                    intervals.append(abs((d1 - d2).days))
                except (ValueError, TypeError):
                    continue
            avg_interval = (
                sum(intervals) / len(intervals) if intervals else DEFAULT_CONSUMPTION_DAYS
            )
        else:
            avg_interval = DEFAULT_CONSUMPTION_DAYS

        # Норма потребления в день (кг)
        if avg_interval > 0:
            consumption_rate = last_qty / avg_interval
        else:
            consumption_rate = last_qty / DEFAULT_CONSUMPTION_DAYS

        # Прогноз остатка
        estimated_remaining = max(0, last_qty - (consumption_rate * days_since_purchase))
        days_until_empty = estimated_remaining / consumption_rate if consumption_rate > 0 else 0

        # Срок годности — используем прямой SQL запрос
        expiry_days = DEFAULT_EXPIRY_DAYS.get("бакалея", 30)  # default
        _tag_result = await db.execute(
            select(ProductTag.name)
            .join(ProductTagMember, ProductTagMember.tag_id == ProductTag.id)
            .where(ProductTagMember.product_id == product.id)
        )
        for (tag_name,) in _tag_result.all():
            tag_name = tag_name.lower()
            if tag_name in DEFAULT_EXPIRY_DAYS:
                expiry_days = DEFAULT_EXPIRY_DAYS[tag_name]
                break

        expected_expiry = (last_date + timedelta(days=expiry_days)).isoformat()

        fridge.append(
            {
                "product_id": product_id,
                "product_name": product.name,
                "estimated_quantity": round(estimated_remaining, 2),
                "unit": "кг",
                "last_purchased": last_date_str,
                "expected_expiry": expected_expiry,
                "consumption_rate": round(consumption_rate, 3),
                "days_until_empty": round(days_until_empty, 1),
                "days_since_purchase": days_since_purchase,
            }
        )

    # Сортируем: сначала те, что скоро закончатся
    fridge.sort(key=lambda x: x["days_until_empty"] if x["days_until_empty"] is not None else 999)
    return fridge


# ============================================================
# Recipe Suggestions
# ============================================================


async def suggest_recipes(
    db: AsyncSession,
    user_id: str,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """
    Поиск рецептов по доступным продуктам.
    Анализирует, какие продукты есть у пользователя, и находит подходящие рецепты.
    """
    # Получаем продукты пользователя (из холодильника)
    fridge = await get_fridge_status(db, user_id)
    available_product_ids = {p["product_id"] for p in fridge if p["estimated_quantity"] > 0}

    if not available_product_ids:
        return []

    # Получаем рецепты с ингредиентами (лимит 50, чтобы не грузить всё)
    result = await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.ingredients).selectinload(RecipeIngredient.product))
        .limit(50)
    )
    recipes = result.scalars().all()

    # Pre-load all substitute products to avoid N+1
    # Collect all ingredient product_ids that need substitute checking
    all_ingredient_ids = set()
    for recipe in recipes:
        for ing in recipe.ingredients or []:
            if ing.product_id and ing.product_id not in available_product_ids:
                all_ingredient_ids.add(ing.product_id)

    # Load all substitutes in one query
    substitute_map: dict[str, list[dict[str, Any]]] = {}
    if all_ingredient_ids:
        sub_result = await db.execute(
            select(ProductSubstitute)
            .where(ProductSubstitute.product_id.in_(all_ingredient_ids))
            .where(ProductSubstitute.substitute_product_id.in_(available_product_ids))
        )
        all_subs = sub_result.scalars().all()

        # Collect substitute_product_ids to load in batch
        sub_product_ids = {s.substitute_product_id for s in all_subs}
        sub_products_map: dict[str, str] = {}
        if sub_product_ids:
            sub_prod_result = await db.execute(
                select(Product).where(Product.id.in_(sub_product_ids))
            )
            for p in sub_prod_result.scalars().all():
                sub_products_map[p.id] = p.name

        for sub in all_subs:
            substitute_map.setdefault(sub.product_id, []).append(
                {
                    "substitute_product_id": sub.substitute_product_id,
                    "substitute_name": sub_products_map.get(sub.substitute_product_id, "?"),
                    "similarity_score": sub.similarity_score,
                }
            )

    suggestions: list[dict[str, Any]] = []

    for recipe in recipes:
        ingredients_list = list(recipe.ingredients or [])
        total_ingredients = len(ingredients_list)
        if total_ingredients == 0:
            continue

        matched = 0
        missing: list[dict[str, Any]] = []
        substitutes_available: list[dict[str, Any]] = []

        for ing in ingredients_list:
            if ing.product_id in available_product_ids:
                matched += 1
            else:
                subs = substitute_map.get(ing.product_id, [])
                if subs:
                    for sub in subs[:3]:
                        substitutes_available.append(
                            {
                                "original_product_id": ing.product_id,
                                "original_name": ing.product.name if ing.product else "?",
                                "substitute_product_id": sub["substitute_product_id"],
                                "substitute_name": sub["substitute_name"],
                                "similarity_score": sub["similarity_score"],
                            }
                        )
                    matched += 0.5  # частичное совпадение через замену
                else:
                    missing.append(
                        {
                            "product_id": ing.product_id,
                            "product_name": ing.product.name if ing.product else "?",
                            "quantity": ing.quantity,
                            "unit": ing.unit,
                            "importance_score": ing.importance_score,
                        }
                    )

        match_score = matched / total_ingredients if total_ingredients > 0 else 0

        # Учитываем importance_score: если отсутствует важный ингредиент, снижаем score
        for m in missing:
            if m["importance_score"] >= 0.8:
                match_score *= 0.5  # сильно снижаем
            elif m["importance_score"] >= 0.5:
                match_score *= 0.8

        if match_score >= 0.3:  # хотя бы 30% совпадение
            # Парсим теги
            recipe_tags = json.loads(recipe.tags) if recipe.tags else []

            suggestions.append(
                {
                    "recipe": {
                        "id": recipe.id,
                        "name": recipe.name,
                        "instructions": recipe.instructions,
                        "cooking_time_minutes": recipe.cooking_time_minutes,
                        "tags": recipe_tags,
                        "ingredients": [
                            {
                                "product_id": ing.product_id,
                                "product_name": ing.product.name if ing.product else "?",
                                "quantity": ing.quantity,
                                "unit": ing.unit,
                                "importance_score": ing.importance_score,
                            }
                            for ing in ingredients_list
                        ],
                        "created_at": recipe.created_at.isoformat() if recipe.created_at else "",
                    },
                    "match_score": round(match_score, 2),
                    "missing_products": missing,
                    "available_substitutes": substitutes_available,
                }
            )

    # Сортируем по убыванию match_score
    suggestions.sort(key=lambda x: -x["match_score"])
    return suggestions[:limit]


# ============================================================
# AI Cache helpers
# ============================================================


async def get_cached_response(
    db: AsyncSession,
    user_id: str,
    action: str,
    context_hash: str,
    question_hash: str | None = None,
) -> str | None:
    """Получение кэшированного AI-ответа."""
    query = select(AiCache).where(
        AiCache.user_id == user_id,
        AiCache.action == action,
        AiCache.context_hash == context_hash,
        AiCache.expires_at > _utcnow(),
    )
    if question_hash:
        query = query.where(AiCache.question_hash == question_hash)

    result = await db.execute(query.order_by(AiCache.created_at.desc()).limit(1))
    cached = result.scalar_one_or_none()
    return cached.response if cached else None


async def set_cached_response(
    db: AsyncSession,
    user_id: str,
    action: str,
    context_hash: str,
    response: str,
    question_hash: str | None = None,
    ttl_hours: int = 24,
) -> None:
    """Сохранение AI-ответа в кэш."""
    cache = AiCache(
        user_id=user_id,
        action=action,
        context_hash=context_hash,
        question_hash=question_hash,
        response=response,
        expires_at=_utcnow() + timedelta(hours=ttl_hours),
    )
    db.add(cache)
    await db.commit()
