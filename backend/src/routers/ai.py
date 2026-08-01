import json
import logging
import time
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..ai_service import ALL_ACTIONS, LOCAL_ACTIONS, AiServiceError, TaskRouter
from ..analytics import get_cached_response, set_cached_response
from ..auth import get_current_user, get_current_user_optional
from ..credits import (
    InsufficientCreditsError,
    get_user_credits_info,
    refund_credits,
    reserve_credits,
)
from ..database import get_db
from ..models import AiReport, Receipt, ReceiptItem, User
from ..product_matching import compute_context_hash
from ..schemas import AiRequest, AiResult, AiSection, CreditsInfo
from ..utils import LIMIT_DEFAULT, LIMIT_DELETE, normalize_date, with_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI"])
task_router = TaskRouter()

get = with_rate_limit(router.get, LIMIT_DEFAULT)
post = with_rate_limit(router.post, LIMIT_DEFAULT)
delete = with_rate_limit(router.delete, LIMIT_DELETE)

AVAILABLE_ACTIONS = [
    {"id": "overall-analysis", "label": "Общий анализ"},
    {"id": "save-money", "label": "Как сэкономить"},
    {"id": "healthy-food", "label": "Полезность покупок"},
    {"id": "recipes", "label": "Что приготовить"},
    {"id": "ingredients", "label": "Состав продуктов"},
    {"id": "shopping-cart", "label": "Корзина продуктов"},
    {"id": "expiring-products", "label": "Сроки годности"},
    {"id": "habits", "label": "Привычки питания"},
    {"id": "diet", "label": "Рацион питания"},
    {"id": "ask", "label": "Задать вопрос"},
]

# Максимальное количество чеков для загрузки (6 месяцев ~ 180 чеков)
MAX_RECEIPTS = 200


@get("/ai/actions")
async def get_actions():
    return AVAILABLE_ACTIONS


@get("/ai/credits", response_model=CreditsInfo)
async def get_credits(
    request: Request = None,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host if request and request.client else None
    info = await get_user_credits_info(db=db, user=user, ip=ip)
    return CreditsInfo(**info)


@post("/ai/run", response_model=AiResult)
async def run_ai(
    body: AiRequest,
    request: Request,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    # ============================================================
    # LOG: начало запроса
    # ============================================================
    log_ctx = {"action": body.action}
    logger.info("AI request started", extra=log_ctx)
    start_time = time.monotonic()

    # ============================================================
    # Проверка: пользователь обязателен
    # ============================================================
    if user is None:
        logger.warning("AI request rejected: unauthenticated", extra=log_ctx)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    if body.action not in ALL_ACTIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unknown AI action",
        )

    ip = request.client.host if request and request.client else None
    is_llm_action = body.action not in LOCAL_ACTIONS

    # ============================================================
    # Получение чеков (только для LLM-действий, LOCAL сами ходят в БД)
    # ============================================================
    period_from = body.parameters.periodFrom if body.parameters else None
    period_to = body.parameters.periodTo if body.parameters else None

    if is_llm_action:
        query = select(Receipt).where(Receipt.user_id == user.id)

        if period_from:
            query = query.where(Receipt.date >= normalize_date(period_from))
        if period_to:
            query = query.where(Receipt.date <= normalize_date(period_to))

        result = await db.execute(
            query.options(selectinload(Receipt.items).selectinload(ReceiptItem.product))
            .order_by(Receipt.date.desc())
            .limit(MAX_RECEIPTS)
        )
        receipts = result.scalars().all()
    else:
        receipts = []

    logger.info(
        "Receipts loaded",
        extra={
            **log_ctx,
            "receipt_count": len(receipts),
        },
    )

    receipts_info = [
        {
            "id": r.id,
            "date": r.date.isoformat() if hasattr(r.date, "isoformat") else str(r.date),
            "store": r.store,
            "total": float(r.total),
            "items": [
                {
                    "name": it.name,
                    "quantity": it.quantity,
                    "price": float(it.price),
                    "unit": it.unit,
                    "product_id": it.product_id,
                }
                for it in (r.items or [])
            ],
        }
        for r in receipts
    ]

    context: dict[str, Any] = {}

    # Важные поля — в начало, чтобы не обрезались _truncate
    context["receipt_count"] = len(receipts)
    context["total_spent"] = float(sum((r.total for r in receipts), start=0))

    if body.parameters and body.parameters.members:
        context["members"] = [m.model_dump() for m in body.parameters.members]

    if body.parameters and body.parameters.history:
        context["history"] = [h.model_dump() for h in body.parameters.history]

    # Самый объёмный блок — в самый конец
    context["receipts"] = receipts_info

    # ============================================================
    # LOCAL actions — без AI, без кредитов, без кэша
    # ============================================================
    if body.action in LOCAL_ACTIONS:
        logger.info("Processing local action (no AI)", extra=log_ctx)
        values = body.parameters.model_dump(exclude_none=True) if body.parameters else {}
        sections_raw = await task_router.route(
            action=body.action,
            parameters=values,
            context=context,
            db=db,
            user_id=user.id,
        )

        try:
            sections_parsed = [AiSection(**s) for s in sections_raw]
        except (TypeError, ValidationError):
            logger.warning("Failed to parse local sections", extra=log_ctx)
            sections_parsed = [AiSection(type="text", text=str(sections_raw))]

        report_id = uuid.uuid4().hex
        now = datetime.now().isoformat()

        ai_report = AiReport(
            id=report_id,
            action=body.action,
            user_id=user.id,
            snapshot=json.dumps(
                {
                    "receiptCount": len(receipts),
                    "totalSpent": float(sum((r.total for r in receipts), start=0)),
                    "receiptIds": [r.id for r in receipts],
                },
                ensure_ascii=False,
            ),
            response=json.dumps([s.model_dump() for s in sections_parsed], ensure_ascii=False),
        )
        db.add(ai_report)
        await db.commit()

        logger.info(
            "Local AI request completed",
            extra={
                **log_ctx,
                "duration_ms": round((time.monotonic() - start_time) * 1000, 2),
                "section_count": len(sections_parsed),
            },
        )

        return AiResult(
            id=report_id,
            action=body.action,
            createdAt=now,
            sections=sections_parsed,
        )

    # ============================================================
    # LLM actions (LIGHT / STRONG)
    # ============================================================

    context_hash = compute_context_hash(user.id, body.action, context)

    question_hash = None
    if body.action == "ask" and body.parameters and body.parameters.question:
        question_hash = compute_context_hash(
            user.id, body.action, {"question": body.parameters.question}
        )

    # ============================================================
    # Проверка кэша
    # ============================================================
    cached = await get_cached_response(
        db=db,
        user_id=user.id,
        action=body.action,
        context_hash=context_hash,
        question_hash=question_hash,
    )
    if cached:
        logger.info("Using cached AI response", extra=log_ctx)
        sections_raw = cached
        # Не списываем кредиты при cache-hit
    else:
        try:
            reservation = await reserve_credits(db=db, user=user, ip=ip, action=body.action)
        except InsufficientCreditsError as exc:
            logger.warning("AI request rejected: credits exhausted", extra=log_ctx)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="AI credits exceeded",
            ) from exc

        parameters = body.parameters.model_dump(exclude_none=True) if body.parameters else None
        route_completed = False
        try:
            sections_raw = await task_router.route(
                action=body.action,
                parameters=parameters,
                context=context,
                db=db,
                user_id=user.id,
            )
            route_completed = True
        except AiServiceError as exc:
            logger.warning("AI provider request failed", extra=log_ctx)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI provider unavailable",
            ) from exc
        finally:
            if not route_completed:
                await refund_credits(db, reservation)

        logger.info(
            "AI API response received",
            extra={
                **log_ctx,
                "duration_ms": round((time.monotonic() - start_time) * 1000, 2),
            },
        )

        # Кэшируем ответ
        await set_cached_response(
            db=db,
            user_id=user.id,
            action=body.action,
            context_hash=context_hash,
            response=json.dumps(sections_raw, ensure_ascii=False),
            question_hash=question_hash,
            ttl_hours=24,
        )

        logger.info("Credits reserved", extra=log_ctx)

    # ============================================================
    # Парсинг ответа в секции
    # ============================================================
    try:
        if isinstance(sections_raw, str):
            # Try to parse as JSON array
            try:
                parsed = json.loads(sections_raw)
                sections_parsed = [AiSection(**s) for s in parsed]
            except (json.JSONDecodeError, TypeError):
                # Not JSON, treat as plain text
                sections_parsed = [AiSection(type="text", title="Ответ", text=sections_raw)]
        else:
            sections_parsed = [AiSection(**s) for s in sections_raw]
    except (TypeError, ValidationError):
        logger.warning("Failed to parse AI sections", extra=log_ctx)
        sections_parsed = [AiSection(type="text", text=str(sections_raw) if sections_raw else "")]

    # ============================================================
    # Сохранение отчёта
    # ============================================================
    report_id = uuid.uuid4().hex
    now = datetime.now().isoformat()

    ai_report = AiReport(
        id=report_id,
        action=body.action,
        user_id=user.id,
        snapshot=json.dumps(
            {
                "receiptCount": len(receipts),
                "totalSpent": float(sum((r.total for r in receipts), start=0)),
                "receiptIds": [r.id for r in receipts],
            },
            ensure_ascii=False,
        ),
        response=json.dumps([s.model_dump() for s in sections_parsed], ensure_ascii=False),
    )
    db.add(ai_report)
    await db.commit()

    logger.info(
        "AI request completed",
        extra={
            **log_ctx,
            "duration_ms": round((time.monotonic() - start_time) * 1000, 2),
            "section_count": len(sections_parsed),
        },
    )

    return AiResult(
        id=report_id,
        action=body.action,
        createdAt=now,
        sections=sections_parsed,
    )


@get("/ai/history", response_model=list[AiResult])
async def get_history(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AiReport)
        .where(AiReport.user_id == user.id)
        .order_by(AiReport.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    reports = result.scalars().all()
    return [
        AiResult(
            id=r.id,
            action=r.action,
            createdAt=r.created_at.isoformat() if r.created_at else "",
            sections=_parse_sections(r.response),
        )
        for r in reports
    ]


@get("/ai/history/{report_id}", response_model=AiResult)
async def get_report(
    report_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AiReport).where(AiReport.id == report_id, AiReport.user_id == user.id)
    )
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return AiResult(
        id=r.id,
        action=r.action,
        createdAt=r.created_at.isoformat() if r.created_at else "",
        sections=_parse_sections(r.response),
    )


@delete("/ai/history/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AiReport).where(AiReport.id == report_id, AiReport.user_id == user.id)
    )
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    await db.delete(r)
    await db.commit()


def _parse_sections(response_json: str | None) -> list[AiSection]:
    if not response_json:
        return []
    try:
        data = json.loads(response_json)
        return [AiSection(**s) for s in data]
    except (json.JSONDecodeError, TypeError, ValidationError):
        logger.warning("Failed to parse stored sections")
        return []
