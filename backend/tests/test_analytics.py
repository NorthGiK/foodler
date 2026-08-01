"""
Tests for src/analytics.py - Local analytics without AI.
"""

import pytest


from src.analytics import (
    get_spending_summary,
    get_nutrition_summary,
    get_fridge_status,
    get_cached_response,
    set_cached_response,
)


class TestGetSpendingSummary:
    """Tests for spending aggregation."""

    @pytest.mark.asyncio
    async def test_no_receipts(self, async_session, test_user):
        """Should return empty summary for user without receipts."""
        result = await get_spending_summary(async_session, test_user.id)
        assert result["receipt_count"] == 0
        assert result["total_spent"] == 0
        assert result["avg_receipt"] == 0
        assert result["by_month"] == []
        assert result["by_store"] == []

    @pytest.mark.asyncio
    async def test_with_receipts(self, async_session, test_user, test_receipts):
        """Should aggregate spending correctly."""
        result = await get_spending_summary(async_session, test_user.id)
        assert result["receipt_count"] == 3
        assert result["total_spent"] == 2350.0  # 1200 + 850 + 300

    @pytest.mark.asyncio
    async def test_avg_receipt(self, async_session, test_user, test_receipts):
        """Should calculate average receipt correctly."""
        result = await get_spending_summary(async_session, test_user.id)
        assert result["avg_receipt"] == 783.33  # 2350 / 3

    @pytest.mark.asyncio
    async def test_by_month(self, async_session, test_user, test_receipts):
        """Should aggregate spending by month."""
        result = await get_spending_summary(async_session, test_user.id)
        assert len(result["by_month"]) == 2  # Jan and Feb
        jan = [m for m in result["by_month"] if m["month"] == "2024-01"]
        feb = [m for m in result["by_month"] if m["month"] == "2024-02"]
        assert len(jan) == 1
        assert len(feb) == 1
        assert jan[0]["total"] == 2050.0  # 1200 + 850
        assert feb[0]["total"] == 300.0

    @pytest.mark.asyncio
    async def test_by_store(self, async_session, test_user, test_receipts):
        """Should aggregate spending by store."""
        result = await get_spending_summary(async_session, test_user.id)
        stores = {s["store"]: s["total"] for s in result["by_store"]}
        assert "Пятёрочка" in stores
        assert "Магнит" in stores
        assert stores["Пятёрочка"] == 1500.0  # 1200 + 300
        assert stores["Магнит"] == 850.0

    @pytest.mark.asyncio
    async def test_date_filtering(self, async_session, test_user, test_receipts):
        """Should filter by date range."""
        result = await get_spending_summary(
            async_session, test_user.id, from_date="2024-02-01", to_date="2024-02-28"
        )
        assert result["receipt_count"] == 1
        assert result["total_spent"] == 300.0

    @pytest.mark.asyncio
    async def test_date_filtering_no_results(self, async_session, test_user, test_receipts):
        """Should return empty for date range with no receipts."""
        result = await get_spending_summary(
            async_session, test_user.id, from_date="2025-01-01", to_date="2025-12-31"
        )
        assert result["receipt_count"] == 0


class TestGetNutritionSummary:
    """Tests for nutrition analysis."""

    @pytest.mark.asyncio
    async def test_no_items(self, async_session, test_user):
        """Should return empty nutrition for user without items."""
        result = await get_nutrition_summary(async_session, test_user.id)
        assert result["total_calories"] == 0
        assert result["by_tag"] == []

    @pytest.mark.asyncio
    async def test_with_items(self, async_session, test_user, test_receipt, test_products):
        """Should calculate nutrition from receipt items."""
        result = await get_nutrition_summary(async_session, test_user.id)
        # milk: 1 * 1000g * (50/100) = 500 cal
        # kefir: 2 * 1000g * (36/100) = 720 cal
        # chicken: 0.5 * 1000g * (165/100) = 825 cal
        # Total: 2045 cal
        assert result["total_calories"] == pytest.approx(2045.0, rel=0.1)
        assert result["total_proteins"] > 0

    @pytest.mark.asyncio
    async def test_by_tag(self, async_session, test_user, test_receipt, test_products):
        """Should aggregate nutrition by tags."""
        result = await get_nutrition_summary(async_session, test_user.id)
        assert len(result["by_tag"]) > 0
        tag_names = [t["tag"] for t in result["by_tag"]]
        assert "молочка" in tag_names
        assert "мясо" in tag_names

    @pytest.mark.asyncio
    async def test_date_filtering(self, async_session, test_user, test_receipts, test_products):
        """Should filter nutrition by date range."""
        result = await get_nutrition_summary(
            async_session, test_user.id, from_date="2024-01-01", to_date="2024-01-31"
        )
        assert result["total_calories"] > 0


class TestGetFridgeStatus:
    """Tests for fridge/stock prediction."""

    @pytest.mark.asyncio
    async def test_no_receipts(self, async_session, test_user):
        """Should return empty list for user without receipts."""
        fridge = await get_fridge_status(async_session, test_user.id)
        assert fridge == []

    @pytest.mark.asyncio
    async def test_with_receipts(self, async_session, test_user, test_receipt, test_products):
        """Should return fridge status from purchase history."""
        fridge = await get_fridge_status(async_session, test_user.id)
        assert len(fridge) > 0
        product_names = [p["product_name"] for p in fridge]
        assert "Молоко 2.5%" in product_names
        assert "Кефир 1%" in product_names
        assert "Куриная грудка" in product_names

    @pytest.mark.asyncio
    async def test_estimated_quantity(self, async_session, test_user, test_receipt):
        """Should estimate remaining quantity."""
        fridge = await get_fridge_status(async_session, test_user.id)
        for product in fridge:
            assert product["estimated_quantity"] >= 0

    @pytest.mark.asyncio
    async def test_sorted_by_expiry(self, async_session, test_user, test_receipt):
        """Should sort products by days until empty."""
        fridge = await get_fridge_status(async_session, test_user.id)
        for i in range(len(fridge) - 1):
            d1 = fridge[i]["days_until_empty"] if fridge[i]["days_until_empty"] is not None else 999
            d2 = (
                fridge[i + 1]["days_until_empty"]
                if fridge[i + 1]["days_until_empty"] is not None
                else 999
            )
            assert d1 <= d2


class TestAiCache:
    """Tests for AI cache helpers."""

    @pytest.mark.asyncio
    async def test_set_and_get_cache(self, async_session, test_user):
        """Should store and retrieve cached response."""
        await set_cached_response(
            db=async_session,
            user_id=test_user.id,
            action="overall-analysis",
            context_hash="hash123",
            response='{"result": "test"}',
            ttl_hours=24,
        )

        cached = await get_cached_response(
            db=async_session,
            user_id=test_user.id,
            action="overall-analysis",
            context_hash="hash123",
        )
        assert cached == '{"result": "test"}'

    @pytest.mark.asyncio
    async def test_cache_miss(self, async_session, test_user):
        """Should return None for cache miss."""
        cached = await get_cached_response(
            db=async_session,
            user_id=test_user.id,
            action="overall-analysis",
            context_hash="nonexistent_hash",
        )
        assert cached is None

    @pytest.mark.asyncio
    async def test_cache_different_user(self, async_session, test_user):
        """Cache should be user-specific."""
        await set_cached_response(
            db=async_session,
            user_id=test_user.id,
            action="overall-analysis",
            context_hash="hash123",
            response="user1 response",
        )

        cached = await get_cached_response(
            db=async_session,
            user_id="other_user_id",
            action="overall-analysis",
            context_hash="hash123",
        )
        assert cached is None

    @pytest.mark.asyncio
    async def test_cache_with_question_hash(self, async_session, test_user):
        """Should support optional question hash."""
        await set_cached_response(
            db=async_session,
            user_id=test_user.id,
            action="ask",
            context_hash="ctx123",
            response="answer",
            question_hash="qhash456",
        )

        cached = await get_cached_response(
            db=async_session,
            user_id=test_user.id,
            action="ask",
            context_hash="ctx123",
            question_hash="qhash456",
        )
        assert cached == "answer"

        # wrong question hash
        cached = await get_cached_response(
            db=async_session,
            user_id=test_user.id,
            action="ask",
            context_hash="ctx123",
            question_hash="wrong_qhash",
        )
        assert cached is None

    @pytest.mark.asyncio
    async def test_cache_expiration(self, async_session, test_user):
        """Should not return expired cache."""
        # Set with 0 TTL (already expired)
        await set_cached_response(
            db=async_session,
            user_id=test_user.id,
            action="overall-analysis",
            context_hash="hash123",
            response="expired response",
            ttl_hours=0,
        )

        cached = await get_cached_response(
            db=async_session,
            user_id=test_user.id,
            action="overall-analysis",
            context_hash="hash123",
        )
        assert cached is None
