"""
Tests for src/receipt_retention.py - Receipt retention logic.
"""

from datetime import datetime, timedelta
import uuid

import pytest

from src.receipt_retention import compute_receipt_expiry, cleanup_expired_receipts
from src.models import Receipt


class TestComputeReceiptExpiry:
    """Tests for receipt expiry computation."""

    def test_premium_user_returns_none(self, test_premium_user):
        """Premium users should have no expiry (None)."""
        expiry = compute_receipt_expiry(test_premium_user)
        assert expiry is None

    def test_regular_user_returns_30_days(self, test_user):
        """Regular users should get 30 days expiry."""
        expiry = compute_receipt_expiry(test_user)
        assert expiry is not None

        # Should be approximately 30 days from now
        now = datetime.now()
        diff = (expiry - now).days
        assert 28 <= diff <= 31

    def test_expired_sub_user_returns_30_days(self, test_expired_sub_user):
        """Users with expired subscription should get 30 days expiry."""
        expiry = compute_receipt_expiry(test_expired_sub_user)
        assert expiry is not None

        now = datetime.now()
        diff = (expiry - now).days
        assert 28 <= diff <= 31

    def test_premium_but_no_expiry_date(self, async_session, test_user):
        """Premium without subscription_expires should still get 30 days."""
        test_user.premium = True
        test_user.subscription_expires = None
        expiry = compute_receipt_expiry(test_user)
        assert expiry is not None


class TestCleanupExpiredReceipts:
    """Tests for expired receipts cleanup."""

    @pytest.mark.asyncio
    async def test_cleanup_no_expired(self, async_session, test_user):
        """Should return 0 when no expired receipts."""
        # Create a non-expired receipt
        receipt = Receipt(
            id=uuid.uuid4().hex,
            date="2024-01-15",
            store="Test",
            total=100.0,
            user_id=test_user.id,
            receipt_expires_at=datetime.now() + timedelta(days=30),
        )
        async_session.add(receipt)
        await async_session.commit()

        deleted = await cleanup_expired_receipts(async_session)
        assert deleted == 0

    @pytest.mark.asyncio
    async def test_cleanup_expired_receipts(self, async_session, test_user):
        """Should delete expired receipts."""
        # Create an expired receipt
        receipt = Receipt(
            id=uuid.uuid4().hex,
            date="2023-01-01",
            store="Test",
            total=100.0,
            user_id=test_user.id,
            receipt_expires_at=datetime.now() - timedelta(days=1),
        )
        async_session.add(receipt)
        await async_session.commit()

        deleted = await cleanup_expired_receipts(async_session)
        assert deleted == 1

    @pytest.mark.asyncio
    async def test_cleanup_mixed(self, async_session, test_user):
        """Should only delete expired receipts, keep valid ones."""
        expired = Receipt(
            id=uuid.uuid4().hex,
            date="2023-01-01",
            store="Expired",
            total=100.0,
            user_id=test_user.id,
            receipt_expires_at=datetime.now() - timedelta(days=1),
        )
        valid = Receipt(
            id=uuid.uuid4().hex,
            date="2024-01-15",
            store="Valid",
            total=200.0,
            user_id=test_user.id,
            receipt_expires_at=datetime.now() + timedelta(days=30),
        )
        async_session.add_all([expired, valid])
        await async_session.commit()

        deleted = await cleanup_expired_receipts(async_session)
        assert deleted == 1

    @pytest.mark.asyncio
    async def test_cleanup_ignores_none_expiry(self, async_session, test_user):
        """Receipts with None expiry should not be deleted."""
        receipt = Receipt(
            id=uuid.uuid4().hex,
            date="2024-01-15",
            store="Forever",
            total=100.0,
            user_id=test_user.id,
            receipt_expires_at=None,
        )
        async_session.add(receipt)
        await async_session.commit()

        deleted = await cleanup_expired_receipts(async_session)
        assert deleted == 0

    @pytest.mark.asyncio
    async def test_cleanup_multiple_expired(self, async_session, test_user):
        """Should handle multiple expired receipts."""
        receipts = []
        for i in range(5):
            r = Receipt(
                id=uuid.uuid4().hex,
                date="2023-01-01",
                store="Test",
                total=100.0,
                user_id=test_user.id,
                receipt_expires_at=datetime.now() - timedelta(days=i + 1),
            )
            async_session.add(r)
            receipts.append(r)
        await async_session.commit()

        deleted = await cleanup_expired_receipts(async_session)
        assert deleted == 5
