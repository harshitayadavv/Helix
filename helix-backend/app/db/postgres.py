"""
Async SQLAlchemy engine/session setup for PostgreSQL, plus the ORM
model used to track repository ingestion state across the pipeline.
"""
import logging
import uuid
from datetime import datetime
from typing import AsyncGenerator

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger("helix.postgres")

engine = create_async_engine(settings.DATABASE_URL, echo=settings.APP_DEBUG, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


class RepositoryModel(Base):
    __tablename__ = "repositories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    status = Column(String(64), nullable=False, default="pending")
    source_type = Column(String(32), nullable=False, default="upload")
    source_url = Column(String(1024), nullable=True)
    storage_path = Column(String(1024), nullable=True)
    file_count = Column(Integer, default=0)
    function_count = Column(Integer, default=0)
    class_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


async def init_db() -> None:
    """Create tables that don't exist yet. Use Alembic migrations for schema evolution in production."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    await engine.dispose()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a request-scoped async session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
