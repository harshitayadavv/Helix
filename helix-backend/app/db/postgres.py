"""
Async SQLAlchemy engine/session setup for PostgreSQL.

ORM models:
  - RepositoryModel    : repo ingestion state
  - SecurityFinding    : Phase 5 security analysis results
  - CodeSmell          : Phase 6 code smell detection results
  - HealthScore        : Phase 7 project health scores
  - SearchHistory      : Phase 10 search history (backed by Redis, but
                         persisted here for long-term analytics)
"""
import logging
import uuid
from datetime import datetime
from typing import AsyncGenerator

from sqlalchemy import Column, DateTime, Float, Integer, String, Text
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


class SecurityFinding(Base):
    """Phase 5 — one row per security issue found in a repository."""
    __tablename__ = "security_findings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id = Column(String(64), nullable=False, index=True)
    severity = Column(String(16), nullable=False)   # Critical/High/Medium/Low
    file_path = Column(String(1024), nullable=False)
    line_number = Column(Integer, nullable=True)
    issue_type = Column(String(128), nullable=False)
    description = Column(Text, nullable=False)
    suggestion = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CodeSmell(Base):
    """Phase 6 — one row per code smell detected in a repository."""
    __tablename__ = "code_smells"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id = Column(String(64), nullable=False, index=True)
    smell_type = Column(String(128), nullable=False)
    severity = Column(String(16), nullable=False)   # Warning/Info
    node_name = Column(String(512), nullable=False)
    file_path = Column(String(1024), nullable=False)
    description = Column(Text, nullable=False)
    suggestion = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class HealthScore(Base):
    """Phase 7 — overall and sub-scores for a repository analysis run."""
    __tablename__ = "health_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id = Column(String(64), nullable=False, index=True)
    overall_score = Column(Float, nullable=False)
    architecture_score = Column(Float, nullable=False)
    maintainability_score = Column(Float, nullable=False)
    complexity_score = Column(Float, nullable=False)
    security_score = Column(Float, nullable=False)
    performance_score = Column(Float, nullable=False)
    documentation_score = Column(Float, nullable=False)
    # JSON-serialized breakdown dict stored as text
    breakdown = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


async def init_db() -> None:
    """Create all tables. Use Alembic for schema migrations in production."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    await engine.dispose()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a request-scoped async session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
