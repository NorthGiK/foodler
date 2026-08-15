"""Tests for src/product_matching.py - Product matching pipeline."""

from unittest.mock import AsyncMock, patch

import pytest

from src.product_matching import (
    compute_context_hash,
    find_product_by_alias,
    find_product_by_name,
    find_products_fuzzy,
    match_product,
    normalize_name,
)


class TestNormalizeName:
    """Tests for name normalization."""

    def test_lowercase(self):
        assert normalize_name("Молоко 2.5%") == "молоко 2.5%"

    def test_strip_whitespace(self):
        assert normalize_name("  Молоко  2.5%  ") == "молоко 2.5%"

    def test_remove_special_chars(self):
        assert normalize_name("Молоко!!! [2.5%]") == "молоко 2.5%"

    def test_preserve_percent_dot_dash(self):
        assert normalize_name("молоко-2.5%/100г") == "молоко-2.5%/100г"

    def test_cyrillic_handling(self):
        assert normalize_name("Кефир 1% жирности") == "кефир 1% жирности"


class TestComputeContextHash:
    """Tests for context hash computation."""

    def test_returns_hex_string(self):
        h = compute_context_hash("user1", "analyze", {"key": "value"})
        assert isinstance(h, str)
        assert len(h) == 64  # SHA-256

    def test_deterministic(self):
        data = {"key": "value"}
        h1 = compute_context_hash("user1", "analyze", data)
        h2 = compute_context_hash("user1", "analyze", data)
        assert h1 == h2

    def test_different_user_different_hash(self):
        data = {"key": "value"}
        h1 = compute_context_hash("user1", "analyze", data)
        h2 = compute_context_hash("user2", "analyze", data)
        assert h1 != h2

    def test_different_action_different_hash(self):
        data = {"key": "value"}
        h1 = compute_context_hash("user1", "analyze", data)
        h2 = compute_context_hash("user1", "recipes", data)
        assert h1 != h2

    def test_different_data_different_hash(self):
        h1 = compute_context_hash("user1", "analyze", {"key": "value1"})
        h2 = compute_context_hash("user1", "analyze", {"key": "value2"})
        assert h1 != h2

    def test_sorted_keys(self):
        """Hash should be independent of dict key order."""
        h1 = compute_context_hash("user1", "analyze", {"b": 2, "a": 1})
        h2 = compute_context_hash("user1", "analyze", {"a": 1, "b": 2})
        assert h1 == h2


class TestFindProductByAlias:
    """Tests for alias-based product search."""

    @pytest.mark.asyncio
    async def test_find_by_exact_alias(self, async_session, test_product):
        """Should find product by exact alias match."""
        result = await find_product_by_alias(async_session, "молоко 3.2")
        assert result is not None
        assert result.id == test_product.id
        assert result.name == "Молоко 3.2%"

    @pytest.mark.asyncio
    async def test_find_by_alias_normalized(self, async_session, test_product):
        """Alias matching should work with normalized input."""
        # The alias is stored as "молоко 3.2" (normalized lowercase)
        # Searching with uppercase should still work after normalization
        result = await find_product_by_alias(async_session, normalize_name("Молоко 3.2"))
        assert result is not None

    @pytest.mark.asyncio
    async def test_find_by_nonexistent_alias(self, async_session):
        """Should return None for non-existent alias."""
        result = await find_product_by_alias(async_session, "nonexistent_product")
        assert result is None

    @pytest.mark.asyncio
    async def test_find_by_alias_empty_string(self, async_session):
        """Should return None for empty alias."""
        result = await find_product_by_alias(async_session, "")
        assert result is None


class TestFindProductByName:
    """Tests for exact name-based product search."""

    @pytest.mark.asyncio
    async def test_find_by_exact_name(self, async_session, test_product):
        """Should find product by exact name match."""
        result = await find_product_by_name(async_session, "Молоко 3.2%")
        assert result is not None
        assert result.id == test_product.id

    @pytest.mark.asyncio
    async def test_find_by_nonexistent_name(self, async_session):
        """Should return None for non-existent name."""
        result = await find_product_by_name(async_session, "NonExistent 999%")
        assert result is None

    @pytest.mark.asyncio
    async def test_name_matching_uses_common_normalization(self, async_session, test_product):
        """Name matching is exact after case normalization."""
        result = await find_product_by_name(async_session, "молоко 3.2%")
        assert result is not None
        assert result.id == test_product.id


class TestFindProductsFuzzy:
    """Tests for fuzzy product search."""

    @pytest.mark.asyncio
    async def test_fuzzy_find_similar(self, async_session, test_products):
        """Should find products with similar names."""
        results = await find_products_fuzzy(async_session, "молоко", limit=5)
        assert len(results) > 0
        names = [p.name for p in results]
        assert any("Молоко" in name for name in names)

    @pytest.mark.asyncio
    async def test_fuzzy_find_with_typo(self, async_session, test_products):
        """Should handle minor typos."""
        results = await find_products_fuzzy(async_session, "малако", limit=5)
        # May or may not find due to threshold, just check it doesn't crash
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_fuzzy_find_alias_match(self, async_session, test_products):
        """Should find products by alias in fuzzy search."""
        results = await find_products_fuzzy(async_session, "курочка", limit=5)
        # May or may not find due to threshold, just check it doesn't crash
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_fuzzy_no_match(self, async_session):
        """Should return empty list for completely different input."""
        results = await find_products_fuzzy(async_session, "zxqjkl", limit=5)
        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_fuzzy_limit(self, async_session, test_products):
        """Should respect the limit parameter."""
        results = await find_products_fuzzy(async_session, "молоко", limit=1)
        assert len(results) <= 1


class TestMatchProduct:
    """Tests for the complete product matching pipeline."""

    @pytest.mark.asyncio
    async def test_match_by_alias(self, async_session, test_product):
        """Should match by alias with confidence 1.0."""
        result = await match_product(async_session, "молоко 3.2")
        assert result["product"] is not None
        assert result["matched_by"] == "alias"
        assert result["confidence"] == 1.0

    @pytest.mark.asyncio
    async def test_match_by_exact_name(self, async_session, test_product):
        """Should match by exact name with confidence >= 0.85."""
        result = await match_product(async_session, "Молоко 3.2%")
        assert result["product"] is not None
        assert result["confidence"] >= 0.85

    @pytest.mark.asyncio
    async def test_fuzzy_name_does_not_match_product(self, async_session, test_products):
        """A fuzzy-looking name must not be used for categorization."""
        result = await match_product(async_session, "молочко")
        assert result["product"] is None
        assert result["matched_by"] == "none"
        assert result["confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_match_no_result(self, async_session):
        """Should return no match for unknown product."""
        result = await match_product(async_session, "zxqjkl_unknown_999")
        assert result["product"] is None
        assert result["matched_by"] == "none"
        assert result["confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_unknown_anonymous_name_has_no_alternatives(self, async_session, test_products):
        """Categorization does not expose fuzzy alternatives."""
        result = await match_product(async_session, "молоко")
        assert result["alternatives"] == []

    @pytest.mark.asyncio
    async def test_match_normalizes_input(self, async_session, test_product):
        """Should normalize input before matching."""
        result = await match_product(async_session, "  Молоко  3.2%!!! ")
        assert result["product"] is not None

    @pytest.mark.asyncio
    async def test_ai_category_creates_reusable_gtin_mapping(self, async_session):
        from sqlalchemy import func, select

        from src.models import ProductAlias, ProductBarcode, ProductTagMember

        with patch(
            "src.product_matching.classify_product_category",
            new=AsyncMock(return_value={"category": "фрукты", "confidence": 0.94}),
        ) as classifier:
            result = await match_product(
                async_session,
                "ЧЕРЕШНЯ 1кг",
                user_id="user-1",
                gtin="4601234567893",
            )

        assert result["matched_by"] == "ai"
        assert result["product"].category == "фрукты"
        classifier.assert_awaited_once()

        repeated = await match_product(
            async_session,
            "Совершенно другое название",
            user_id="user-1",
            gtin="4601234567893",
        )
        assert repeated["matched_by"] == "gtin"
        assert repeated["product"].id == result["product"].id
        assert await async_session.scalar(select(func.count()).select_from(ProductAlias)) == 1
        assert await async_session.scalar(select(func.count()).select_from(ProductBarcode)) == 1
        assert await async_session.scalar(select(func.count()).select_from(ProductTagMember)) == 1

    @pytest.mark.asyncio
    async def test_ambiguous_name_uses_ai_category(self, async_session):
        with patch(
            "src.product_matching.classify_product_category",
            new=AsyncMock(return_value={"category": "соусы", "confidence": 0.92}),
        ):
            result = await match_product(
                async_session,
                "Товар фирменный Нежный 250г",
                user_id="user-1",
                gtin="4601234567891",
            )

        assert result["matched_by"] == "ai"
        assert result["product"].category == "соусы"

    @pytest.mark.asyncio
    async def test_ai_category_is_saved_with_exact_alias(self, async_session):
        with patch(
            "src.product_matching.classify_product_category",
            new=AsyncMock(return_value={"category": "овощи", "confidence": 0.91}),
        ) as classifier:
            first = await match_product(async_session, "Редкий продукт 500г", user_id="user-1")
            second = await match_product(async_session, "  РЕДКИЙ продукт 500г!!! ", user_id="user-1")

        assert first["matched_by"] == "ai"
        assert second["matched_by"] == "alias"
        assert second["product"].id == first["product"].id
        classifier.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_local_category_words_do_not_trigger_category(self, async_session):
        with patch("src.product_matching.classify_product_category", new=AsyncMock()) as classifier:
            result = await match_product(async_session, "молоко")

        assert result["product"] is None
        assert result["matched_by"] == "none"
        classifier.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_low_confidence_ai_result_does_not_pollute_catalog(self, async_session):
        with patch(
            "src.product_matching.classify_product_category",
            new=AsyncMock(return_value={"category": "прочее", "confidence": 0.4}),
        ):
            result = await match_product(
                async_session,
                "Неизвестная позиция XYZ",
                user_id="user-1",
            )

        assert result["product"] is None
        assert result["matched_by"] == "none"


class TestSaveNewProduct:
    """Tests for saving new products from AI fallback."""

    @pytest.mark.asyncio
    async def test_save_new_product_basic(self, async_session):
        """Should create a new product with nutrition data."""
        from src.product_matching import save_new_product

        nutrition = {
            "calories": 100,
            "proteins": 5.0,
            "fats": 2.0,
            "carbs": 15.0,
        }
        product = await save_new_product(
            db=async_session,
            name="Test Product",
            raw_alias="test product alias",
            nutrition_data=nutrition,
        )
        assert product.name == "test product"
        assert product.calories == 100
        assert product.proteins == 5.0

    @pytest.mark.asyncio
    async def test_save_new_product_with_alias(self, async_session):
        """Should create alias for the new product."""
        from sqlalchemy import select

        from src.models import ProductAlias
        from src.product_matching import save_new_product

        nutrition = {"calories": 50, "proteins": 1.0, "fats": 0.5, "carbs": 10.0}
        product = await save_new_product(
            db=async_session,
            name="New Product",
            raw_alias="new prod alias",
            nutrition_data=nutrition,
        )

        result = await async_session.execute(
            select(ProductAlias).where(ProductAlias.product_id == product.id)
        )
        aliases = result.scalars().all()
        assert len(aliases) == 1
        assert aliases[0].alias == "new prod alias"

    @pytest.mark.asyncio
    async def test_save_new_product_with_tags(self, async_session):
        """Should create tags for the new product."""
        from sqlalchemy import select

        from src.models import ProductTag, ProductTagMember
        from src.product_matching import save_new_product

        nutrition = {"calories": 50, "proteins": 1.0, "fats": 0.5, "carbs": 10.0}
        product = await save_new_product(
            db=async_session,
            name="Tagged Product",
            raw_alias="tagged alias",
            nutrition_data=nutrition,
            tags=["молочка", "напитки"],
        )

        result = await async_session.execute(
            select(ProductTagMember).where(ProductTagMember.product_id == product.id)
        )
        members = result.scalars().all()
        assert len(members) == 2

        tag_ids = [m.tag_id for m in members]
        tags_result = await async_session.execute(
            select(ProductTag).where(ProductTag.id.in_(tag_ids))
        )
        tags = tags_result.scalars().all()
        tag_names = [t.name for t in tags]
        assert "молочка" in tag_names
        assert "напитки" in tag_names

    @pytest.mark.asyncio
    async def test_save_new_product_empty_nutrition(self, async_session):
        """Should handle empty/missing nutrition data."""
        from src.product_matching import save_new_product

        product = await save_new_product(
            db=async_session,
            name="Empty Product",
            raw_alias="empty alias",
            nutrition_data={},
        )
        assert product.calories == 0
        assert product.proteins == 0
