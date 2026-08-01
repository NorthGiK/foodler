"""
Tests for src/credits.py - AI credits management.
"""

import asyncio
from datetime import datetime

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.auth import hash_password
from src.credits import (
    InsufficientCreditsError,
    _ip_hash,
    deduct_credits,
    get_user_credits_info,
)
from src.database import Base
from src.models import AiCreditUsage, User


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

    @pytest.mark.asyncio
    async def test_ask_cannot_overdraw_one_remaining_credit(self, async_session, test_user):
        await deduct_credits(async_session, test_user, ip=None, action="overall-analysis")

        with pytest.raises(InsufficientCreditsError):
            await deduct_credits(async_session, test_user, ip=None, action="ask")

        info = await get_user_credits_info(async_session, test_user)
        assert info["remaining"] == 1.0

    @pytest.mark.asyncio
    async def test_concurrent_reservations_cannot_exceed_limit(self, tmp_path):
        database = tmp_path / "credits.sqlite"
        engine = create_async_engine(f"sqlite+aiosqlite:///{database}")
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with sessions() as session:
            user = User(
                email="concurrent@example.com",
                password_hash=hash_password("TestPass123!"),
                premium=False,
            )
            session.add(user)
            await session.commit()

        async def reserve_once():
            async with sessions() as session:
                return await deduct_credits(session, user, ip=None, action="diet")

        results = await asyncio.gather(
            reserve_once(),
            reserve_once(),
            reserve_once(),
            return_exceptions=True,
        )
        assert sum(not isinstance(result, Exception) for result in results) == 2
        assert sum(isinstance(result, InsufficientCreditsError) for result in results) == 1
        async with sessions() as session:
            info = await get_user_credits_info(session, user)
            assert info["remaining"] == 0.0
        await engine.dispose()
