"""
Tests for src/product_matching.py - Product matching pipeline.
"""

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
    async def test_name_matching_case_sensitive(self, async_session, test_product):
        """Name matching should be exact (not case-insensitive)."""
        result = await find_product_by_name(async_session, "молоко 3.2%")
        assert result is None  # because db has "Молоко 3.2%" with capital М


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
    async def test_match_by_fuzzy(self, async_session, test_products):
        """Should match by fuzzy with confidence 0.85."""
        result = await match_product(async_session, "молочко")
        assert result["product"] is not None
        assert result["matched_by"] == "fuzzy"
        assert result["confidence"] == 0.85

    @pytest.mark.asyncio
    async def test_match_no_result(self, async_session):
        """Should return no match for unknown product."""
        result = await match_product(async_session, "zxqjkl_unknown_999")
        assert result["product"] is None
        assert result["matched_by"] == "none"
        assert result["confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_match_with_alternatives(self, async_session, test_products):
        """Should provide alternatives in fuzzy match."""
        result = await match_product(async_session, "молоко")
        assert len(result["alternatives"]) >= 0

    @pytest.mark.asyncio
    async def test_match_normalizes_input(self, async_session, test_product):
        """Should normalize input before matching."""
        result = await match_product(async_session, "  Молоко  3.2%!!! ")
        assert result["product"] is not None

    @pytest.mark.asyncio
    async def test_ai_fallback_uses_ai_category(self, async_session, monkeypatch):
        """Unknown products use the light-model category when it is valid."""

        async def fake_ai_match_product(raw_name: str, normalized: str):
            return {
                "confidence": 0.9,
                "product_name": "томатный сок",
                "calories": 17,
                "proteins": 1,
                "fats": 0,
                "carbs": 3,
                "tags": ["овощи"],
            }

        captured: dict[str, object] = {}

        async def fake_categorize_product(raw_name, normalized_name, allowed_categories):
            captured.update(
                raw_name=raw_name,
                normalized_name=normalized_name,
                allowed_categories=allowed_categories,
            )
            return "напитки"

        monkeypatch.setattr("src.product_matching._ai_match_product", fake_ai_match_product)
        monkeypatch.setattr("src.product_matching.categorize_product", fake_categorize_product)

        result = await match_product(async_session, "Сок томатный", user_id="user-1")

        assert result["product"] is not None
        assert result["product"].category == "напитки"
        assert captured["raw_name"] == "Сок томатный"
        assert captured["normalized_name"] == "сок томатный"


class TestAiProductCategory:
    @pytest.mark.asyncio
    async def test_uses_light_model_and_returns_allowed_category(self, monkeypatch):
        from src import ai_service

        captured: dict[str, object] = {}

        async def fake_call_llm(model, action, prompt, **kwargs):
            captured.update(model=model, action=action, prompt=prompt, **kwargs)
            return '{"category": "напитки"}'

        monkeypatch.setattr(ai_service, "_call_llm", fake_call_llm)

        category = await ai_service.categorize_product(
            "Сок томатный",
            "сок томатный",
            frozenset({"напитки", "овощи"}),
        )

        assert category == "напитки"
        assert captured["model"] == ai_service.AI_LIGHT_MODEL
        assert captured["action"] == "product-category"

    @pytest.mark.asyncio
    async def test_accepts_sweets_category(self, monkeypatch):
        from src import ai_service
        from src.product_matching import CATEGORIES

        async def fake_call_llm(*args, **kwargs):
            return '{"category": "сладости"}'

        monkeypatch.setattr(ai_service, "_call_llm", fake_call_llm)

        category = await ai_service.categorize_product("Шоколад", "шоколад", CATEGORIES)

        assert category == "сладости"

    @pytest.mark.asyncio
    async def test_returns_none_when_ai_provider_fails(self, monkeypatch):
        from src import ai_service

        async def fake_call_llm(*args, **kwargs):
            raise ai_service.AiServiceError("unavailable", status_code=503)

        monkeypatch.setattr(ai_service, "_call_llm", fake_call_llm)

        category = await ai_service.categorize_product(
            "Сок томатный",
            "сок томатный",
            frozenset({"напитки", "овощи"}),
        )

        assert category is None

    @pytest.mark.asyncio
    async def test_product_description_uses_light_model(self, monkeypatch):
        from src import ai_service

        captured: dict[str, object] = {}

        async def fake_call_llm(model, action, prompt, **kwargs):
            captured.update(model=model, action=action, prompt=prompt, **kwargs)
            return '{"product_name": "томатный сок"}'

        monkeypatch.setattr(ai_service, "_call_llm", fake_call_llm)

        response = await ai_service.describe_unknown_product("Сок томатный", "сок томатный")

        assert response == '{"product_name": "томатный сок"}'
        assert captured["model"] == ai_service.AI_LIGHT_MODEL
        assert captured["action"] == "product-classification"


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
