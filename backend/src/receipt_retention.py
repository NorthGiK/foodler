"""
Логика хранения чеков:
- Авторизованные пользователи без подписки: чеки хранятся 30 дней
- Пользователи с активной подпиской: чеки хранятся бесконечно
- Если подписка закончилась, старые чеки остаются, новые — с лимитом 30 дней
"""

from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Receipt, ReceiptItem

RECEIPT_RETENTION_DAYS = 30


def compute_receipt_expiry(has_active_subscription: bool) -> datetime | None:
    """
    Вычисляет дату истечения хранения чека.
    Возвращает None для бесконечного хранения (подписка активна),
    иначе datetime в будущем (текущее время + 30 дней).
    """
    # Если у пользователя активна подписка — храним бесконечно
    if has_active_subscription:
        return None

    # Иначе — 30 дней с момента сохранения
    return datetime.now() + timedelta(days=RECEIPT_RETENTION_DAYS)


async def cleanup_expired_receipts(db: AsyncSession) -> int:
    """
    Удаляет чеки, у которых receipt_expires_at < now.
    Возвращает количество удалённых чеков.
    """
    now = datetime.now()
    expired_receipts = select(Receipt.id).where(
        Receipt.receipt_expires_at.isnot(None),
        Receipt.receipt_expires_at < now,
    )
    expired_count = await db.scalar(select(func.count()).select_from(expired_receipts.subquery()))
    if not expired_count:
        return 0

    await db.execute(delete(ReceiptItem).where(ReceiptItem.receipt_id.in_(expired_receipts)))
    await db.execute(delete(Receipt).where(Receipt.id.in_(expired_receipts)))
    await db.commit()
    return expired_count
