from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db, async_session
from .receipt_retention import cleanup_expired_receipts
from .routers import ROUTERS


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Очистка просроченных чеков при старте
    async with async_session() as db:
        deleted = await cleanup_expired_receipts(db)
        if deleted:
            print(f"Cleaned up {deleted} expired receipts")
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

@app.get("/health")
async def health():
    return {"status": "ok"}
