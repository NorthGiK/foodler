import logging
import re
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, async_session
from .logging_config import configure_logging, request_id_context
from .receipt_retention import cleanup_expired_receipts
from .routers import ROUTERS
from .schemas import StatusResponse

configure_logging()
logger = logging.getLogger(__name__)
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Очистка просроченных чеков при старте
    async with async_session() as db:
        deleted = await cleanup_expired_receipts(db)
        if deleted:
            logger.info("Expired receipts cleaned up", extra={"deleted_count": deleted})
    yield


app = FastAPI(
    title="Food Spend Tracker API",
    version="1.4.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in ROUTERS:
    app.include_router(router, prefix="/api")


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
        logger.info(
            "HTTP request completed",
            extra={
                "method": request.method,
                "path": path,
                "status_code": response.status_code,
                "duration_ms": round((time.monotonic() - started) * 1000, 2),
            },
        )
        response.headers["X-Request-ID"] = request_id
        return response
    # ASGI boundary: record safe metadata, then re-raise the original failure.
    except Exception:
        logger.exception(
            "HTTP request failed",
            extra={
                "method": request.method,
                "path": "unmatched",
                "status_code": 500,
                "duration_ms": round((time.monotonic() - started) * 1000, 2),
            },
        )
        raise
    finally:
        request_id_context.reset(token)


@app.get("/health", response_model=StatusResponse)
async def health():
    return {"status": "ok"}
