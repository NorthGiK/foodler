import asyncio
import logging
import re
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from .config import (
    CORS_ORIGINS,
    METRICS_TOKEN,
    PRODUCT_ANALYTICS_MAX_PAYLOAD_BYTES,
    RECEIPT_CLEANUP_INTERVAL_SECONDS,
)
from .database import async_session, check_database, get_db
from .integrations.http import close_http_session
from .logging_config import request_id_context
from .metrics import record_http_request, render_prometheus
from .receipt_retention import cleanup_expired_receipts
from .routers import ROUTERS, legacy_router
from .schemas import StatusResponse
from .utils import cleanup_rate_limit_buckets

# configure_logging()
logger = logging.getLogger(__name__)
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = asyncio.create_task(_periodic_cleanup(), name="database-cleanup")
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        await close_http_session()


async def _periodic_cleanup() -> None:
    while True:
        try:
            async with async_session() as db:
                deleted_receipts = await cleanup_expired_receipts(db)
                deleted_limits = await cleanup_rate_limit_buckets(db)
            if deleted_receipts or deleted_limits:
                logger.info(
                    "Database retention completed",
                    extra={
                        "deleted_count": deleted_receipts,
                        "rate_limit_buckets_deleted": deleted_limits,
                    },
                )
        except SQLAlchemyError:
            logger.warning("Database retention failed", extra={"operation": "retention"})
        await asyncio.sleep(RECEIPT_CLEANUP_INTERVAL_SECONDS)


app = FastAPI(
    title="Food Spend Tracker API",
    version="1.5.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def analytics_request_size_limit(request: Request, call_next):
    if request.url.path == "/api/product-analytics/events":
        content_length = request.headers.get("content-length")
        if content_length is not None and content_length.isdigit() and int(content_length) > PRODUCT_ANALYTICS_MAX_PAYLOAD_BYTES:
            return JSONResponse(status_code=413, content={"detail": "Payload too large"})
        body = await request.body()
        if len(body) > PRODUCT_ANALYTICS_MAX_PAYLOAD_BYTES:
            return JSONResponse(status_code=413, content={"detail": "Payload too large"})
    return await call_next(request)

for router in ROUTERS:
    app.include_router(router, prefix="/api")

# Temporary compatibility endpoint for mobile builds configured without `/api`.
# Only the public image-recognition route is exposed outside the API prefix.
app.include_router(legacy_router)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    supplied_request_id = request.headers.get("X-Request-ID", "")
    request_id = (
        supplied_request_id if _REQUEST_ID_PATTERN.fullmatch(supplied_request_id) else uuid4().hex
    )
    token = request_id_context.set(request_id)
    started = time.monotonic()
    try:
        response = await call_next(request)
        route = request.scope.get("route")
        path = getattr(route, "path", "unmatched")
        duration_seconds = time.monotonic() - started
        logger.info(
            "HTTP request completed",
            extra={
                "method": request.method,
                "path": path,
                "status_code": response.status_code,
                "duration_ms": round(duration_seconds * 1000, 2),
            },
        )
        record_http_request(request.method, path, response.status_code, duration_seconds)
        response.headers["X-Request-ID"] = request_id
        return response
    # ASGI boundary: record safe metadata, then re-raise the original failure.
    except Exception:
        duration_seconds = time.monotonic() - started
        logger.exception(
            "HTTP request failed",
            extra={
                "method": request.method,
                "path": "unmatched",
                "status_code": 500,
                "duration_ms": round(duration_seconds * 1000, 2),
            },
        )
        record_http_request(request.method, "unmatched", 500, duration_seconds)
        raise
    finally:
        request_id_context.reset(token)


@app.get("/health", response_model=StatusResponse)
async def health():
    return {"status": "ok"}


@app.get("/ready", response_model=StatusResponse)
async def readiness(db: AsyncSession = Depends(get_db)):
    await check_database(db)
    return {"status": "ok"}


@app.get("/metrics", include_in_schema=False)
async def metrics(authorization: str | None = Header(default=None)):
    if not METRICS_TOKEN:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if authorization != f"Bearer {METRICS_TOKEN}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return Response(render_prometheus(), media_type="text/plain; version=0.0.4")
