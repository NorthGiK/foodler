"""
Tests for AI API endpoints - /api/ai/*
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


class TestGetActions:
    """Tests for GET /api/ai/actions"""

    @pytest.mark.asyncio
    async def test_get_actions(self, client: AsyncClient):
        """Should return list of available actions."""
        response = await client.get("/api/ai/actions")
        assert response.status_code == 200
        actions = response.json()
        assert len(actions) > 0
        action_ids = [a["id"] for a in actions]
        assert "diet" in action_ids
        assert "ask" in action_ids
        assert "recipes" in action_ids


class TestGetCredits:
    """Tests for GET /api/ai/credits"""

    @pytest.mark.asyncio
    async def test_credits_authenticated(self, client: AsyncClient, auth_headers):
        """Should return credits for authenticated user."""
        response = await client.get("/api/ai/credits", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "remaining" in data
        assert "period_limit" in data
        assert "period" in data

    @pytest.mark.asyncio
    async def test_credits_anonymous(self, client: AsyncClient):
        """Should return credits for anonymous user."""
        response = await client.get("/api/ai/credits")
        assert response.status_code == 200
        data = response.json()
        assert "remaining" in data
        assert "period" in data


class TestRunAi:
    """Tests for POST /api/ai/run"""

    @pytest.mark.asyncio
    async def test_unauthenticated(self, client: AsyncClient):
        """Should reject with 401 when not authenticated."""
        response = await client.post(
            "/api/ai/run",
            json={"action": "diet", "parameters": {}},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_credits_exhausted(
        self, client: AsyncClient, auth_headers, async_session, test_user
    ):
        """Should reject with 429 when credits exhausted."""
        from datetime import datetime, timedelta

        from src.models import AiCreditUsage

        # Use up all daily credits
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        for _ in range(5):
            usage = AiCreditUsage(
                user_id=test_user.id,
                action="diet",
                credits=1.0,
                created_at=today_start + timedelta(seconds=1),
            )
            async_session.add(usage)
        await async_session.commit()

        response = await client.post(
            "/api/ai/run",
            headers=auth_headers,
            json={"action": "diet", "parameters": {}},
        )
        assert response.status_code == 429

    @pytest.mark.asyncio
    async def test_credits_not_checked_for_local_actions(
        self, client: AsyncClient, auth_headers, async_session, test_user
    ):
        """LOCAL actions should NOT check credits even if exhausted."""
        from datetime import datetime, timedelta

        from src.models import AiCreditUsage

        # Use up all daily credits
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        for _ in range(5):
            usage = AiCreditUsage(
                user_id=test_user.id,
                action="overall-analysis",
                credits=1.0,
                created_at=today_start + timedelta(seconds=1),
            )
            async_session.add(usage)
        await async_session.commit()

        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            mock_route.return_value = [
                {"type": "text", "title": "Анализ", "text": "Локальный ответ"}
            ]

            response = await client.post(
                "/api/ai/run",
                headers=auth_headers,
                json={"action": "overall-analysis", "parameters": {}},
            )
            # Should succeed even though credits are exhausted (LOCAL action)
            assert response.status_code == 200, f"Response: {response.text}"

    @pytest.mark.asyncio
    async def test_successful_response(self, client: AsyncClient, auth_headers):
        """Should return parsed sections on success."""
        mock_sections = [
            {"type": "text", "title": "Анализ", "text": "Ваш рацион сбалансирован."},
            {"type": "score", "title": "Оценка", "value": 85, "max": 100},
        ]

        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            with patch("src.routers.ai.set_cached_response", new_callable=AsyncMock) as mock_cache:
                mock_route.return_value = mock_sections

                response = await client.post(
                    "/api/ai/run",
                    headers=auth_headers,
                    json={
                        "action": "diet",
                        "parameters": {
                            "periodFrom": "14.07.2026",
                            "periodTo": "14.07.2026",
                            "members": [
                                {
                                    "name": "Даша",
                                    "age": 20,
                                    "height": 150,
                                    "weight": 60,
                                    "gender": "Женский",
                                    "additional_info": "Мало ест и любит бананы",
                                }
                            ],
                        },
                    },
                )
                assert response.status_code == 200, f"Response: {response.text}"
                data = response.json()
                assert data["action"] == "diet"
                assert len(data["sections"]) == 2
                assert data["sections"][0]["type"] == "text"
                assert data["sections"][1]["type"] == "score"

    @pytest.mark.asyncio
    async def test_response_without_title(self, client: AsyncClient, auth_headers):
        """Should handle AI response without title field."""
        mock_sections = [
            {"type": "text", "text": "Ответ без заголовка"},
            {"type": "score", "value": 75, "max": 100},
        ]

        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            with patch("src.routers.ai.set_cached_response", new_callable=AsyncMock) as mock_cache:
                mock_route.return_value = mock_sections

                response = await client.post(
                    "/api/ai/run",
                    headers=auth_headers,
                    json={"action": "diet", "parameters": {}},
                )
                # Should NOT return 500 — title is optional now
                assert response.status_code == 200, f"Response: {response.text}"
                data = response.json()
                assert len(data["sections"]) == 2
                assert data["sections"][0]["title"] == "Ответ"  # default fallback
                assert data["sections"][1]["title"] == "Ответ"  # default fallback

    @pytest.mark.asyncio
    async def test_ai_api_error_refunds_reserved_credit(
        self,
        client: AsyncClient,
        auth_headers,
        async_session,
        test_user,
    ):
        from src.ai_service import AiServiceError
        from src.credits import get_user_credits_info

        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            mock_route.side_effect = AiServiceError("boom", status_code=500)
            response = await client.post(
                "/api/ai/run",
                headers=auth_headers,
                json={"action": "diet", "parameters": {}},
            )

        assert response.status_code == 502
        info = await get_user_credits_info(async_session, test_user)
        assert info["remaining"] == 2.0

    @pytest.mark.asyncio
    async def test_invalid_json_response(self, client: AsyncClient, auth_headers):
        """Should handle broken JSON from AI gracefully."""
        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            with patch("src.routers.ai.set_cached_response", new_callable=AsyncMock) as mock_cache:
                mock_route.return_value = [{"type": "unknown", "weird": "data"}]

                response = await client.post(
                    "/api/ai/run",
                    headers=auth_headers,
                    json={"action": "diet", "parameters": {}},
                )
                assert response.status_code == 200, f"Response: {response.text}"
                data = response.json()
                assert len(data["sections"]) == 1

    @pytest.mark.asyncio
    async def test_cached_response_no_credits_deducted(
        self, client: AsyncClient, auth_headers, async_session, test_user
    ):
        """Should NOT deduct credits when response is from cache."""
        from datetime import datetime, timedelta, timezone

        from src.models import AiCache, AiCreditUsage
        from src.product_matching import compute_context_hash

        # Pre-compute the context_hash that will match
        context = {
            "receipts": [],
            "receipt_count": 0,
            "total_spent": 0,
        }
        expected_hash = compute_context_hash(test_user.id, "diet", context)

        # Create a cached response with the matching hash
        cached = AiCache(
            user_id=test_user.id,
            action="diet",
            context_hash=expected_hash,
            response=json.dumps([{"type": "text", "title": "Кэш", "text": "Из кэша"}]),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        )
        async_session.add(cached)
        await async_session.commit()

        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            with patch("src.routers.ai.set_cached_response", new_callable=AsyncMock):
                response = await client.post(
                    "/api/ai/run",
                    headers=auth_headers,
                    json={"action": "diet", "parameters": {}},
                )
                assert response.status_code == 200, f"Response: {response.text}"
                data = response.json()
                assert data["sections"][0]["title"] == "Кэш"
                assert data["sections"][0]["text"] == "Из кэша"
                # Ensure AI was NOT called (cache hit)
                assert mock_route.call_count == 0, "AI should not be called when cache hits"

                # Verify no credits were deducted
                from sqlalchemy import func, select

                usage_count = await async_session.scalar(
                    select(func.count()).where(AiCreditUsage.user_id == test_user.id)
                )
                assert usage_count == 0, f"Expected 0 credit usages, got {usage_count}"

    @pytest.mark.asyncio
    async def test_with_period_filter(
        self, client: AsyncClient, auth_headers, async_session, test_user, test_products
    ):
        """Should filter receipts by period."""
        import uuid

        from src.models import Receipt, ReceiptItem

        milk = test_products[0]

        # Receipt inside period
        r1 = Receipt(
            id=uuid.uuid4().hex,
            date="2026-07-14",
            store="Магнит",
            total=100.0,
            user_id=test_user.id,
        )
        async_session.add(r1)
        await async_session.flush()

        # Receipt outside period
        r2 = Receipt(
            id=uuid.uuid4().hex,
            date="2026-05-01",
            store="Пятёрочка",
            total=200.0,
            user_id=test_user.id,
        )
        async_session.add(r2)
        await async_session.flush()

        async_session.add(
            ReceiptItem(
                receipt_id=r1.id, name="Молоко", quantity=1, price=100.0, product_id=milk.id
            )
        )
        async_session.add(ReceiptItem(receipt_id=r2.id, name="Кефир", quantity=1, price=50.0))
        await async_session.commit()

        mock_sections = [{"type": "text", "title": "Анализ", "text": "OK"}]

        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            with patch("src.routers.ai.set_cached_response", new_callable=AsyncMock):
                mock_route.return_value = mock_sections

                response = await client.post(
                    "/api/ai/run",
                    headers=auth_headers,
                    json={
                        "action": "diet",
                        "parameters": {
                            "periodFrom": "14.07.2026",
                            "periodTo": "14.07.2026",
                        },
                    },
                )
                assert response.status_code == 200, f"Response: {response.text}"
                # Check that only 1 receipt was in context
                call_args = mock_route.call_args
                assert call_args is not None
                context = call_args[1]["context"]
                assert context["receipt_count"] == 1, (
                    f"Expected 1 receipt, got {context['receipt_count']}"
                )

    # ---- LOCAL action tests (no AI, no credits) ----

    @pytest.mark.asyncio
    async def test_local_action_no_credits_needed(
        self, client: AsyncClient, auth_headers, async_session, test_user
    ):
        """LOCAL actions should not check credits."""
        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            mock_route.return_value = [
                {"type": "text", "title": "Анализ", "text": "Локальный ответ"}
            ]

            response = await client.post(
                "/api/ai/run",
                headers=auth_headers,
                json={"action": "overall-analysis", "parameters": {}},
            )
            assert response.status_code == 200, f"Response: {response.text}"
            data = response.json()
            assert data["action"] == "overall-analysis"
            assert len(data["sections"]) == 1

    @pytest.mark.asyncio
    async def test_local_action_recipes(self, client: AsyncClient, auth_headers):
        """LOCAL recipes action should work without AI."""
        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            mock_route.return_value = [{"type": "text", "title": "Рецепт", "text": "Суп"}]

            response = await client.post(
                "/api/ai/run",
                headers=auth_headers,
                json={"action": "recipes", "parameters": {}},
            )
            assert response.status_code == 200, f"Response: {response.text}"
            data = response.json()
            assert data["action"] == "recipes"
            assert data["sections"][0]["text"] == "Суп"

    @pytest.mark.asyncio
    async def test_local_action_expiring(self, client: AsyncClient, auth_headers):
        """LOCAL expiring-products action should work without AI."""
        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            mock_route.return_value = [
                {"type": "list", "title": "Скоро закончится", "items": ["Молоко"]}
            ]

            response = await client.post(
                "/api/ai/run",
                headers=auth_headers,
                json={"action": "expiring-products", "parameters": {}},
            )
            assert response.status_code == 200, f"Response: {response.text}"
            data = response.json()
            assert data["action"] == "expiring-products"
            assert data["sections"][0]["type"] == "list"

    @pytest.mark.asyncio
    async def test_local_action_ingredients(self, client: AsyncClient, auth_headers):
        """LOCAL ingredients action should work without AI."""
        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            mock_route.return_value = [{"type": "text", "title": "Нутриенты", "text": "КБЖУ"}]

            response = await client.post(
                "/api/ai/run",
                headers=auth_headers,
                json={"action": "ingredients", "parameters": {}},
            )
            assert response.status_code == 200, f"Response: {response.text}"
            data = response.json()
            assert data["action"] == "ingredients"
            assert data["sections"][0]["type"] == "text"

    @pytest.mark.asyncio
    async def test_local_action_does_not_load_receipts(
        self, client: AsyncClient, auth_headers, async_session, test_user
    ):
        """LOCAL actions should NOT load receipts (they query DB themselves)."""
        import uuid

        from src.models import Receipt

        # Create a receipt — LOCAL action should NOT load it
        r = Receipt(
            id=uuid.uuid4().hex,
            date="2026-07-14",
            store="Магнит",
            total=100.0,
            user_id=test_user.id,
        )
        async_session.add(r)
        await async_session.commit()

        with patch("src.routers.ai.task_router.route", new_callable=AsyncMock) as mock_route:
            mock_route.return_value = [
                {"type": "text", "title": "Анализ", "text": "Локальный ответ"}
            ]

            response = await client.post(
                "/api/ai/run",
                headers=auth_headers,
                json={"action": "overall-analysis", "parameters": {}},
            )
            assert response.status_code == 200, f"Response: {response.text}"

            # Verify that context passed to task_router has 0 receipts
            call_args = mock_route.call_args
            assert call_args is not None
            context = call_args[1]["context"]
            assert context["receipt_count"] == 0, (
                f"Expected 0 receipts for LOCAL action, got {context['receipt_count']}"
            )

    @pytest.mark.asyncio
    async def test_real_local_action_never_calls_llm_or_uses_credits(
        self,
        client: AsyncClient,
        auth_headers,
        async_session,
        test_user,
    ):
        from sqlalchemy import func, select

        from src.models import AiCreditUsage

        with patch(
            "src.ai_service._call_llm",
            new=AsyncMock(side_effect=AssertionError("LLM must not be called")),
        ):
            response = await client.post(
                "/api/ai/run",
                headers=auth_headers,
                json={"action": "overall-analysis", "parameters": {}},
            )

        assert response.status_code == 200
        assert response.json()["sections"]
        usage_count = await async_session.scalar(
            select(func.count()).where(AiCreditUsage.user_id == test_user.id)
        )
        assert usage_count == 0


class TestGetHistory:
    """Tests for GET /api/ai/history"""

    @pytest.mark.asyncio
    async def test_history_unauthenticated(self, client: AsyncClient):
        """Should reject with 401 when not authenticated."""
        response = await client.get("/api/ai/history")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_history_empty(self, client: AsyncClient, auth_headers):
        """Should return empty list when no history."""
        response = await client.get("/api/ai/history", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_history_with_reports(
        self, client: AsyncClient, auth_headers, async_session, test_user
    ):
        """Should return report history."""
        from datetime import datetime

        from src.models import AiReport

        report = AiReport(
            id="test_report_1",
            action="diet",
            user_id=test_user.id,
            snapshot='{"receiptCount": 0}',
            response=json.dumps([{"type": "text", "title": "Test", "text": "Content"}]),
            created_at=datetime.now(),
        )
        async_session.add(report)
        await async_session.commit()

        response = await client.get("/api/ai/history", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == "test_report_1"
        assert data[0]["action"] == "diet"

    @pytest.mark.asyncio
    async def test_history_ignore_other_users(
        self, client: AsyncClient, auth_headers, async_session
    ):
        """Should not return other users' reports."""
        from datetime import datetime

        from src.models import AiReport, User

        other_user = User(email="other@example.com", password_hash="hash")
        async_session.add(other_user)
        await async_session.flush()

        report = AiReport(
            id="other_report",
            action="diet",
            user_id=other_user.id,
            snapshot="{}",
            response="[]",
            created_at=datetime.now(),
        )
        async_session.add(report)
        await async_session.commit()

        response = await client.get("/api/ai/history", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []  # other user's report should not appear

    @pytest.mark.asyncio
    async def test_history_pagination(
        self, client: AsyncClient, auth_headers, async_session, test_user
    ):
        """Should support skip/limit pagination."""
        from datetime import datetime

        from src.models import AiReport

        for i in range(5):
            report = AiReport(
                id=f"report_{i}",
                action="diet",
                user_id=test_user.id,
                snapshot="{}",
                response="[]",
                created_at=datetime.now(),
            )
            async_session.add(report)
        await async_session.commit()

        # Get first 2
        response = await client.get("/api/ai/history?skip=0&limit=2", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

        # Get next 2 (skip 2)
        response = await client.get("/api/ai/history?skip=2&limit=2", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

        # Get with skip beyond total
        response = await client.get("/api/ai/history?skip=10&limit=2", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0


class TestGetReport:
    """Tests for GET /api/ai/history/{report_id}"""

    @pytest.mark.asyncio
    async def test_get_report_not_found(self, client: AsyncClient, auth_headers):
        """Should return 404 for non-existent report."""
        response = await client.get("/api/ai/history/nonexistent", headers=auth_headers)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_report_success(
        self, client: AsyncClient, auth_headers, async_session, test_user
    ):
        """Should return report by ID."""
        from datetime import datetime

        from src.models import AiReport

        report = AiReport(
            id="my_report",
            action="diet",
            user_id=test_user.id,
            snapshot='{"receiptCount": 5}',
            response=json.dumps([{"type": "text", "title": "Анализ", "text": "Хорошо"}]),
            created_at=datetime.now(),
        )
        async_session.add(report)
        await async_session.commit()

        response = await client.get("/api/ai/history/my_report", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "my_report"
        assert len(data["sections"]) == 1
        assert data["sections"][0]["text"] == "Хорошо"


class TestDeleteReport:
    """Tests for DELETE /api/ai/history/{report_id}"""

    @pytest.mark.asyncio
    async def test_delete_report_success(
        self, client: AsyncClient, auth_headers, async_session, test_user
    ):
        """Should delete a report."""
        from datetime import datetime

        from src.models import AiReport

        report = AiReport(
            id="delete_me",
            action="diet",
            user_id=test_user.id,
            snapshot="{}",
            response="[]",
            created_at=datetime.now(),
        )
        async_session.add(report)
        await async_session.commit()

        response = await client.delete("/api/ai/history/delete_me", headers=auth_headers)
        assert response.status_code == 204

        # Verify it's gone
        get_response = await client.get("/api/ai/history/delete_me", headers=auth_headers)
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_report_not_found(self, client: AsyncClient, auth_headers):
        """Should return 404 for non-existent report."""
        response = await client.delete("/api/ai/history/nonexistent", headers=auth_headers)
        assert response.status_code == 404
