"""
API endpoints для локальной базы знаний:
- Продукты (CRUD, поиск, распознавание)
- Рецепты (CRUD, предложения)
- Аналитика (траты, КБЖУ, холодильник)
- Замены продуктов
"""

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi_throttle import RateLimiter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import get_current_user
from ..database import get_db
from ..models import (
    Product,
    ProductAlias,
    ProductTag,
    ProductTagMember,
    ProductSubstitute,
    Recipe,
    RecipeIngredient,
    User,
)
from ..schemas import (
    ProductSchema,
    ProductCreateSchema,
    ProductMatchRequest,
    ProductMatchResult,
    ProductSearchResult,
    ProductTagSchema,
    ProductSubstituteSchema,
    RecipeSchema,
    RecipeCreateSchema,
    RecipeSuggestion,
    NutritionSummary,
    FridgeProduct,
)
from ..product_matching import match_product, normalize_name
from ..analytics import (
    get_spending_summary,
    get_nutrition_summary,
    get_fridge_status,
    suggest_recipes,
)
from src.utils import with_rate_limit

router = APIRouter(tags=["Knowledge Base"])
get = with_rate_limit(router.get, RateLimiter(100, 1))
post = with_rate_limit(router.post, RateLimiter(100, 1))

# ============================================================
# Helpers — загрузка связей через прямые SQL запросы
# ============================================================


async def _load_aliases(db: AsyncSession, product_id: str) -> list[str]:
    """Загрузка алиасов продукта через прямой SQL."""
    result = await db.execute(
        select(ProductAlias.alias).where(ProductAlias.product_id == product_id)
    )
    return [row[0] for row in result.all()]


async def _load_tags(db: AsyncSession, product_id: str) -> list[dict[str, Any]]:
    """Загрузка тегов продукта через прямой SQL."""
    result = await db.execute(
        select(ProductTag.name, ProductTagMember.weight)
        .join(ProductTagMember, ProductTagMember.tag_id == ProductTag.id)
        .where(ProductTagMember.product_id == product_id)
    )
    return [{"name": row[0], "weight": row[1]} for row in result.all()]


async def _product_to_schema(product: Product, db: AsyncSession) -> ProductSchema:
    """Конвертация Product в Pydantic схему с загрузкой связей."""
    aliases = await _load_aliases(db, product.id)
    tags = await _load_tags(db, product.id)
    return ProductSchema(
        id=product.id,
        name=product.name,
        parent_id=product.parent_id,
        calories=product.calories,
        proteins=product.proteins,
        fats=product.fats,
        carbs=product.carbs,
        fiber=product.fiber,
        sugar=product.sugar,
        saturated_fats=product.saturated_fats,
        sodium=product.sodium,
        cholesterol=product.cholesterol,
        vitamin_a=product.vitamin_a,
        vitamin_c=product.vitamin_c,
        vitamin_d=product.vitamin_d,
        calcium=product.calcium,
        iron=product.iron,
        potassium=product.potassium,
        magnesium=product.magnesium,
        serving_size=product.serving_size,
        serving_unit=product.serving_unit,
        aliases=aliases,
        tags=tags,
    )


# ============================================================
# Products
# ============================================================


@get("/products/search", response_model=ProductSearchResult)
async def search_products(
    query: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Поиск продуктов по названию (точный + нечеткий)."""
    from ..product_matching import find_products_fuzzy

    normalized = normalize_name(query)

    # Сначала точный поиск
    result = await db.execute(
        select(Product).where(Product.name.ilike(f"%{normalized}%")).limit(limit)
    )
    exact = list(result.scalars().all())

    # Если мало результатов — fuzzy
    if len(exact) < limit:
        fuzzy = await find_products_fuzzy(db, normalized, limit=limit)
        existing_ids = {p.id for p in exact}
        for p in fuzzy:
            if p.id not in existing_ids:
                exact.append(p)
                existing_ids.add(p.id)
                if len(exact) >= limit:
                    break

    results = []
    for p in exact:
        results.append(await _product_to_schema(p, db))

    return ProductSearchResult(query=query, results=results)


@get("/products/{product_id}", response_model=ProductSchema)
async def get_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Получение продукта по ID."""
    result = await db.execute(select(Product).where(Product.id == product_id).limit(1))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )
    return await _product_to_schema(product, db)


@post(
    "/products", response_model=ProductSchema, status_code=status.HTTP_201_CREATED
)
async def create_product(
    body: ProductCreateSchema,
    db: AsyncSession = Depends(get_db),
):
    """Создание нового продукта (вручную)."""
    product = Product(
        name=normalize_name(body.name),
        parent_id=body.parent_id,
        calories=body.calories,
        proteins=body.proteins,
        fats=body.fats,
        carbs=body.carbs,
        fiber=body.fiber,
        sugar=body.sugar,
        saturated_fats=body.saturated_fats,
        sodium=body.sodium,
        cholesterol=body.cholesterol,
        vitamin_a=body.vitamin_a,
        vitamin_c=body.vitamin_c,
        vitamin_d=body.vitamin_d,
        calcium=body.calcium,
        iron=body.iron,
        potassium=body.potassium,
        magnesium=body.magnesium,
        serving_size=body.serving_size,
        serving_unit=body.serving_unit,
    )
    db.add(product)
    await db.flush()

    # Алиасы
    for alias_name in body.aliases:
        alias = ProductAlias(product_id=product.id, alias=normalize_name(alias_name))
        db.add(alias)

    # Теги
    for tag_name in body.tags:
        tag_result = await db.execute(
            select(ProductTag).where(ProductTag.name == tag_name).limit(1)
        )
        tag = tag_result.scalar_one_or_none()
        if not tag:
            tag = ProductTag(name=tag_name)
            db.add(tag)
            await db.flush()
        member = ProductTagMember(product_id=product.id, tag_id=tag.id, weight=1.0)
        db.add(member)

    await db.commit()
    await db.refresh(product)
    return await _product_to_schema(product, db)


@post("/products/match", response_model=ProductMatchResult)
async def match_product_endpoint(
    body: ProductMatchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Распознавание продукта по сырому названию."""
    result = await match_product(db, body.raw_name, body.quantity, body.unit)

    if result["product"]:
        product = result["product"]
        schema = await _product_to_schema(product, db)
        alternatives = []
        for p in result["alternatives"]:
            alternatives.append(await _product_to_schema(p, db))
        return ProductMatchResult(
            product=schema,
            confidence=result["confidence"],
            matched_by=result["matched_by"],
            alternatives=alternatives,
        )
    else:
        return ProductMatchResult(
            product=None,
            confidence=0.0,
            matched_by="none",
            alternatives=[],
        )


# ============================================================
# Product Substitutes
# ============================================================


@get(
    "/products/{product_id}/substitutes", response_model=list[ProductSubstituteSchema]
)
async def get_substitutes(
    product_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Получение аналогов продукта."""
    result = await db.execute(
        select(ProductSubstitute)
        .where(ProductSubstitute.product_id == product_id)
        .options(selectinload(ProductSubstitute.substitute_product))
        .order_by(ProductSubstitute.similarity_score.desc())
    )
    substitutes = result.scalars().all()

    return [
        ProductSubstituteSchema(
            product_id=sub.product_id,
            substitute_product_id=sub.substitute_product_id,
            substitute_name=sub.substitute_product.name
            if sub.substitute_product
            else "?",
            similarity_score=sub.similarity_score,
            ratio=sub.ratio,
            notes=sub.notes,
        )
        for sub in substitutes
    ]


# ============================================================
# Recipes
# ============================================================


@get("/recipes", response_model=list[RecipeSchema])
async def list_recipes(
    tag: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Список рецептов."""
    query = (
        select(Recipe)
        .options(
            selectinload(Recipe.ingredients).selectinload(RecipeIngredient.product)
        )
        .order_by(Recipe.name)
    )

    if tag:
        query = query.where(Recipe.tags.ilike(f"%{tag}%"))

    result = await db.execute(query.limit(limit))
    recipes = result.scalars().all()
    return [_recipe_to_schema(r) for r in recipes]


@get("/recipes/{recipe_id}", response_model=RecipeSchema)
async def get_recipe(
    recipe_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Получение рецепта по ID."""
    result = await db.execute(
        select(Recipe)
        .where(Recipe.id == recipe_id)
        .options(
            selectinload(Recipe.ingredients).selectinload(RecipeIngredient.product)
        )
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found"
        )
    return _recipe_to_schema(recipe)


@post(
    "/recipes", response_model=RecipeSchema, status_code=status.HTTP_201_CREATED
)
async def create_recipe(
    body: RecipeCreateSchema,
    db: AsyncSession = Depends(get_db),
):
    """Создание нового рецепта."""
    recipe = Recipe(
        name=body.name,
        instructions=body.instructions,
        cooking_time_minutes=body.cooking_time_minutes,
        tags=json.dumps(body.tags, ensure_ascii=False) if body.tags else None,
    )
    db.add(recipe)
    await db.flush()

    for ing in body.ingredients:
        ingredient = RecipeIngredient(
            recipe_id=recipe.id,
            product_id=ing.product_id,
            quantity=ing.quantity,
            unit=ing.unit,
            importance_score=ing.importance_score,
            substitute_ids=json.dumps(ing.substitute_ids)
            if ing.substitute_ids
            else None,
        )
        db.add(ingredient)

    await db.commit()
    # Refresh with ingredients loaded to avoid MissingGreenlet
    await db.refresh(recipe, ["ingredients"])
    # Manually load each ingredient's product relationship
    for ing in recipe.ingredients or []:
        await db.refresh(ing, ["product"])
    return _recipe_to_schema(recipe)


@get("/recipes/suggest", response_model=list[RecipeSuggestion])
async def suggest_recipes_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(5, ge=1, le=20),
):
    """ "Что приготовить?" — подбор рецептов по продуктам пользователя."""
    suggestions = await suggest_recipes(db, user.id, limit=limit)
    return [RecipeSuggestion(**s) for s in suggestions]


# ============================================================
# Analytics
# ============================================================


@get("/analytics/spending")
async def spending_analysis(
    from_date: str | None = None,
    to_date: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Анализ трат за период."""
    return await get_spending_summary(db, user.id, from_date, to_date)


@get("/analytics/nutrition", response_model=NutritionSummary)
async def nutrition_analysis(
    from_date: str | None = None,
    to_date: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Анализ КБЖУ и нутриентов за период."""
    result = await get_nutrition_summary(db, user.id, from_date, to_date)
    return NutritionSummary(**result)


@get("/fridge", response_model=list[FridgeProduct])
async def fridge_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Прогноз остатков в холодильнике."""
    fridge = await get_fridge_status(db, user.id)
    return [FridgeProduct(**p) for p in fridge]


# ============================================================
# Tags
# ============================================================


@get("/tags", response_model=list[ProductTagSchema])
async def list_tags(
    db: AsyncSession = Depends(get_db),
):
    """Список всех тегов (только корневые, без вложенности)."""
    result = await db.execute(
        select(ProductTag)
        .where(ProductTag.parent_id.is_(None))
        .order_by(ProductTag.name)
    )
    tags = result.scalars().all()
    return [_tag_to_schema(t) for t in tags]


# ============================================================
# Helpers
# ============================================================


def _recipe_to_schema(recipe: Recipe) -> RecipeSchema:
    """Конвертация Recipe в Pydantic схему."""
    from ..schemas import RecipeIngredientSchema

    recipe_tags = json.loads(recipe.tags) if recipe.tags else []
    return RecipeSchema(
        id=recipe.id,
        name=recipe.name,
        instructions=recipe.instructions,
        cooking_time_minutes=recipe.cooking_time_minutes,
        tags=recipe_tags,
        ingredients=[
            RecipeIngredientSchema(
                product_id=ing.product_id,
                product_name=ing.product.name if ing.product else "?",
                quantity=ing.quantity,
                unit=ing.unit,
                importance_score=ing.importance_score,
                substitute_ids=json.loads(ing.substitute_ids)
                if ing.substitute_ids
                else [],
            )
            for ing in (recipe.ingredients or [])
        ],
        created_at=recipe.created_at.isoformat() if recipe.created_at else "",
    )


def _tag_to_schema(tag: ProductTag) -> ProductTagSchema:
    """Конвертация ProductTag в Pydantic схему (плоский список, без рекурсии)."""
    return ProductTagSchema(
        id=tag.id,
        name=tag.name,
        parent_id=tag.parent_id,
    )
