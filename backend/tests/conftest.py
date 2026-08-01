"""
Pytest fixtures and configuration for async tests.
Uses aiosqlite with SQLAlchemy async, in-memory SQLite for tests.
"""

from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
import uuid

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
)

from src.database import Base, get_db
from src.main import app
from src.models import (
    User,
    Product,
    ProductAlias,
    ProductTag,
    ProductTagMember,
    Receipt,
    ReceiptItem,
    Recipe,
    RecipeIngredient,
    RefreshToken,
)
from src.auth import hash_password, create_access_token


# ============================================================
# Database fixtures
# ============================================================


@pytest_asyncio.fixture
async def async_engine():
    """Create SQLAlchemy async engine with in-memory SQLite."""
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def async_session(async_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a fresh async session per test with transaction rollback."""
    connection = await async_engine.connect()
    transaction = await connection.begin()

    session = AsyncSession(bind=connection, expire_on_commit=False)

    yield session

    await session.close()
    await transaction.rollback()
    await connection.close()


@pytest_asyncio.fixture
async def db(async_session: AsyncSession) -> AsyncGenerator[AsyncSession, None]:
    """Override FastAPI's get_db dependency."""
    async def _get_db():
        yield async_session

    app.dependency_overrides[get_db] = _get_db
    yield async_session
    app.dependency_overrides.clear()


# ============================================================
# HTTP client fixture
# ============================================================


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client with overridden database dependency."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ============================================================
# User fixtures
# ============================================================


@pytest_asyncio.fixture
async def test_user(async_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(
        email="test@example.com",
        password_hash=hash_password("TestPass123!"),
        premium=False,
        created_at=datetime.now(),
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_premium_user(async_session: AsyncSession) -> User:
    """Create a premium test user."""
    user = User(
        email="premium@example.com",
        password_hash=hash_password("TestPass123!"),
        premium=True,
        subscription_expires=datetime.now() + timedelta(days=30),
        created_at=datetime.now(),
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_expired_sub_user(async_session: AsyncSession) -> User:
    """Create a user with expired subscription."""
    user = User(
        email="expired@example.com",
        password_hash=hash_password("TestPass123!"),
        premium=False,
        subscription_expires=datetime.now() - timedelta(days=1),
        created_at=datetime.now(),
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    return user


@pytest_asyncio.fixture
def auth_headers(test_user: User) -> dict:
    """Generate auth headers for the test user."""
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
def premium_auth_headers(test_premium_user: User) -> dict:
    """Generate auth headers for premium user."""
    token = create_access_token(test_premium_user.id)
    return {"Authorization": f"Bearer {token}"}


# ============================================================
# Product fixtures
# ============================================================


@pytest_asyncio.fixture
async def test_product(async_session: AsyncSession) -> Product:
    """Create a test product."""
    product = Product(
        name="Молоко 3.2%",
        calories=60,
        proteins=2.9,
        fats=3.2,
        carbs=4.7,
        serving_size=100,
        serving_unit="мл",
    )
    async_session.add(product)
    await async_session.flush()

    alias = ProductAlias(product_id=product.id, alias="молоко 3.2")
    async_session.add(alias)
    await async_session.commit()
    await async_session.refresh(product)
    return product


@pytest_asyncio.fixture
async def test_products(async_session: AsyncSession) -> list[Product]:
    """Create multiple test products with tags and aliases."""
    tag_milk = ProductTag(name="молочка")
    tag_drink = ProductTag(name="напитки")
    tag_meat = ProductTag(name="мясо")
    tag_veggie = ProductTag(name="овощи")
    async_session.add_all([tag_milk, tag_drink, tag_meat, tag_veggie])
    await async_session.flush()

    milk = Product(name="Молоко 2.5%", calories=50, proteins=2.8, fats=2.5, carbs=4.7)
    kefir = Product(name="Кефир 1%", calories=36, proteins=3.0, fats=1.0, carbs=4.0)
    chicken = Product(name="Куриная грудка", calories=165, proteins=31.0, fats=3.6, carbs=0.0)
    carrot = Product(name="Морковь", calories=41, proteins=0.9, fats=0.2, carbs=9.6)
    async_session.add_all([milk, kefir, chicken, carrot])
    await async_session.flush()

    # Aliases
    async_session.add_all([
        ProductAlias(product_id=milk.id, alias="молоко 2.5"),
        ProductAlias(product_id=kefir.id, alias="кефир"),
        ProductAlias(product_id=chicken.id, alias="курица"),
        ProductAlias(product_id=carrot.id, alias="морковка"),
    ])

    # Tags
    async_session.add_all([
        ProductTagMember(product_id=milk.id, tag_id=tag_milk.id, weight=1.0),
        ProductTagMember(product_id=milk.id, tag_id=tag_drink.id, weight=0.5),
        ProductTagMember(product_id=kefir.id, tag_id=tag_milk.id, weight=1.0),
        ProductTagMember(product_id=chicken.id, tag_id=tag_meat.id, weight=1.0),
        ProductTagMember(product_id=carrot.id, tag_id=tag_veggie.id, weight=1.0),
    ])

    await async_session.commit()
    return [milk, kefir, chicken, carrot]


@pytest_asyncio.fixture
async def test_recipe(async_session: AsyncSession, test_products: list[Product]) -> Recipe:
    """Create a test recipe with ingredients."""
    milk, kefir, chicken, carrot = test_products

    recipe = Recipe(
        name="Куриный суп",
        instructions='["Нарезать овощи", "Сварить бульон", "Добавить курицу"]',
        cooking_time_minutes=45,
        tags='["суп", "обед"]',
    )
    async_session.add(recipe)
    await async_session.flush()

    async_session.add_all([
        RecipeIngredient(recipe_id=recipe.id, product_id=chicken.id, quantity=0.5, unit="кг", importance_score=1.0),
        RecipeIngredient(recipe_id=recipe.id, product_id=carrot.id, quantity=2, unit="шт", importance_score=0.8),
        RecipeIngredient(recipe_id=recipe.id, product_id=milk.id, quantity=0.2, unit="л", importance_score=0.3),
    ])

    await async_session.commit()
    await async_session.refresh(recipe)
    return recipe


# ============================================================
# Receipt fixtures
# ============================================================


@pytest_asyncio.fixture
async def test_receipt(
    async_session: AsyncSession,
    test_user: User,
    test_products: list[Product],
) -> Receipt:
    """Create a test receipt with items."""
    milk, kefir, chicken, carrot = test_products

    receipt = Receipt(
        id=uuid.uuid4().hex,
        date="2024-01-15",
        store="Магнит",
        total=850.50,
        user_id=test_user.id,
        receipt_expires_at=datetime.now() + timedelta(days=30),
    )
    async_session.add(receipt)
    await async_session.flush()

    async_session.add_all([
        ReceiptItem(receipt_id=receipt.id, name="Молоко 2.5%", quantity=1, price=75.0, product_id=milk.id),
        ReceiptItem(receipt_id=receipt.id, name="Кефир 1%", quantity=2, price=60.0, product_id=kefir.id),
        ReceiptItem(receipt_id=receipt.id, name="Куриная грудка", quantity=0.5, price=250.0, product_id=chicken.id),
    ])

    await async_session.commit()
    await async_session.refresh(receipt)
    return receipt


@pytest_asyncio.fixture
async def test_receipts(
    async_session: AsyncSession,
    test_user: User,
    test_products: list[Product],
) -> list[Receipt]:
    """Create multiple receipts spanning different months."""
    milk, kefir, chicken, carrot = test_products

    receipts_data = [
        ("2024-01-05", "Пятёрочка", 1200.0, [
            ("Молоко 2.5%", 2, 150.0, milk.id),
            ("Куриная грудка", 1, 500.0, chicken.id),
        ]),
        ("2024-01-15", "Магнит", 850.0, [
            ("Кефир 1%", 2, 120.0, kefir.id),
            ("Морковь", 1, 30.0, carrot.id),
        ]),
        ("2024-02-01", "Пятёрочка", 300.0, [
            ("Молоко 2.5%", 1, 75.0, milk.id),
        ]),
    ]

    receipts = []
    for date, store, total, items in receipts_data:
        receipt = Receipt(
            id=uuid.uuid4().hex,
            date=date,
            store=store,
            total=total,
            user_id=test_user.id,
            receipt_expires_at=datetime.now() + timedelta(days=30),
        )
        async_session.add(receipt)
        await async_session.flush()

        for name, qty, price, pid in items:
            async_session.add(ReceiptItem(
                receipt_id=receipt.id, name=name, quantity=qty, price=price, product_id=pid
            ))

        receipts.append(receipt)

    await async_session.commit()
    return receipts


# ============================================================
# Refresh token fixtures
# ============================================================


@pytest_asyncio.fixture
async def test_refresh_token(async_session: AsyncSession, test_user: User) -> RefreshToken:
    """Create a valid refresh token."""
    rt = RefreshToken(
        token="test_refresh_token_123",
        user_id=test_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    async_session.add(rt)
    await async_session.commit()
    return rt


@pytest_asyncio.fixture
async def test_expired_refresh_token(async_session: AsyncSession, test_user: User) -> RefreshToken:
    """Create an expired refresh token."""
    rt = RefreshToken(
        token="test_expired_refresh_token_456",
        user_id=test_user.id,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    async_session.add(rt)
    await async_session.commit()
    return rt
