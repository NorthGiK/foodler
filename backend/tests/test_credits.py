"""
Tests for src/credits.py - AI credits management.
"""

from datetime import datetime

import pytest

from src.credits import get_user_credits_info, deduct_credits, _ip_hash
from src.models import AiCreditUsage


class TestGetUserCreditsInfo:
    """Tests for credit info retrieval."""

    @pytest.mark.asyncio
    async def test_premium_user_2day_limit(self, async_session, test_premium_user):
        """Premium users should have 10 credits per 2-day period."""
        info = await get_user_credits_info(async_session, test_premium_user)
        assert info["remaining"] == 10.0
        assert info["period_limit"] == 10.0
        assert info["period"] == "2day"
        assert info["subscription"] is True

    @pytest.mark.asyncio
    async def test_authorized_user_monthly_limit(self, async_session, test_user):
        """Regular users should have 2 credits per month."""
        info = await get_user_credits_info(async_session, test_user)
        assert info["remaining"] == 2.0
        assert info["period_limit"] == 2.0
        assert info["period"] == "month"
        assert info["subscription"] is False

    @pytest.mark.asyncio
    async def test_authorized_user_after_usage(self, async_session, test_user):
        """Should deduct credits from remaining."""
        usage = AiCreditUsage(
            user_id=test_user.id,
            action="analyze",
            credits=1.0,
            created_at=datetime.now(),
        )
        async_session.add(usage)
        await async_session.commit()

        info = await get_user_credits_info(async_session, test_user)
        assert info["remaining"] == 1.0

    @pytest.mark.asyncio
    async def test_authorized_user_exhausted(self, async_session, test_user):
        """Should show 0 remaining when all credits used."""
        usage = AiCreditUsage(
            user_id=test_user.id,
            action="analyze",
            credits=2.0,
            created_at=datetime.now(),
        )
        async_session.add(usage)
        await async_session.commit()

        info = await get_user_credits_info(async_session, test_user)
        assert info["remaining"] == 0.0

    @pytest.mark.asyncio
    async def test_unauthorized_user_monthly_limit(self, async_session):
        """Unauthorized users should have 2 credits per month."""
        info = await get_user_credits_info(async_session, user=None, ip="127.0.0.1")
        assert info["remaining"] == 2.0
        assert info["period_limit"] == 2.0
        assert info["period"] == "month"

    @pytest.mark.asyncio
    async def test_unauthorized_user_after_usage(self, async_session):
        """Should deduct credits for unauthorized users."""
        ip_hash = _ip_hash("127.0.0.1")
        usage = AiCreditUsage(
            user_id=None,
            ip_hash=ip_hash,
            action="analyze",
            credits=1.0,
            created_at=datetime.now(),
        )
        async_session.add(usage)
        await async_session.commit()

        info = await get_user_credits_info(async_session, user=None, ip="127.0.0.1")
        assert info["remaining"] == 1.0

    @pytest.mark.asyncio
    async def test_different_ip_different_limits(self, async_session):
        """Different IPs should have separate limits."""
        ip1_usage = AiCreditUsage(
            user_id=None,
            ip_hash=_ip_hash("192.168.1.1"),
            action="analyze",
            credits=1.0,
            created_at=datetime.now(),
        )
        async_session.add(ip1_usage)
        await async_session.commit()

        info1 = await get_user_credits_info(async_session, user=None, ip="192.168.1.1")
        info2 = await get_user_credits_info(async_session, user=None, ip="10.0.0.1")

        assert info1["remaining"] == 1.0
        assert info2["remaining"] == 2.0


class TestDeductCredits:
    """Tests for credit deduction."""

    @pytest.mark.asyncio
    async def test_deduct_credits_for_ask_action(self, async_session, test_user):
        """'ask' action should cost 2 credits."""
        await deduct_credits(async_session, test_user, ip=None, action="ask")

        info = await get_user_credits_info(async_session, test_user)
        assert info["remaining"] == 0.0  # 2 - 2 = 0

    @pytest.mark.asyncio
    async def test_deduct_credits_for_other_actions(self, async_session, test_user):
        """Non-'ask' actions should cost 1 credit."""
        await deduct_credits(async_session, test_user, ip=None, action="overall-analysis")

        info = await get_user_credits_info(async_session, test_user)
        assert info["remaining"] == 1.0  # 2 - 1

    @pytest.mark.asyncio
    async def test_deduct_credits_multiple_times(self, async_session, test_user):
        """Should accumulate deductions."""
        for _ in range(2):
            await deduct_credits(async_session, test_user, ip=None, action="analyze")

        info = await get_user_credits_info(async_session, test_user)
        assert info["remaining"] == 0.0  # 2 - 2 = 0

    @pytest.mark.asyncio
    async def test_deduct_credits_for_unauthorized(self, async_session):
        """Should deduct for unauthorized users."""
        await deduct_credits(async_session, user=None, ip="127.0.0.1", action="analyze")

        info = await get_user_credits_info(async_session, user=None, ip="127.0.0.1")
        assert info["remaining"] == 1.0  # 2 - 1
