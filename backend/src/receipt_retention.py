"""
Логика хранения чеков:
- Авторизованные пользователи без подписки: чеки хранятся 30 дней
- Пользователи с активной подпиской: чеки хранятся бесконечно
- Если подписка закончилась, старые чеки остаются, новые — с лимитом 30 дней
"""

from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Receipt, User

RECEIPT_RETENTION_DAYS = 30


def compute_receipt_expiry(user: User) -> datetime | None:
    """
    Вычисляет дату истечения хранения чека.
    Возвращает None для бесконечного хранения (подписка активна),
    иначе datetime в будущем (текущее время + 30 дней).
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Если у пользователя активна подписка — храним бесконечно
    if user.premium and user.subscription_expires and user.subscription_expires > now:
        return None

    # Иначе — 30 дней с момента сохранения
    return datetime.now() + timedelta(days=RECEIPT_RETENTION_DAYS)


async def cleanup_expired_receipts(db: AsyncSession) -> int:
    """
    Удаляет чеки, у которых receipt_expires_at < now.
    Возвращает количество удалённых чеков.
    """
    now = datetime.now()
    result = await db.execute(
        select(Receipt.id).where(
            Receipt.receipt_expires_at.isnot(None),
            Receipt.receipt_expires_at < now,
        )
    )
    expired_ids = [row[0] for row in result.all()]

    if not expired_ids:
        return 0

    await db.execute(delete(Receipt).where(Receipt.id.in_(expired_ids)))
    await db.commit()
    return len(expired_ids)
