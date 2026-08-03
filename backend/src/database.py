from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def check_database(session: AsyncSession | None = None) -> None:
    """Fail readiness when the configured database is unreachable."""
    if session is not None:
        await session.execute(select(1))
        return
    async with async_session() as session:
        await session.execute(select(1))
