"""
Async SQLAlchemy engine/session setup for PostgreSQL.

ORM models:
  RepositoryModel   — repo ingestion state
  SecurityFinding   — Phase 5  security analysis results
  CodeSmell         — Phase 6  code smell detection results
  HealthScore       — Phase 7  project health scores
  GitCommit         — Phase 11 git log entries
  PerformanceIssue  — Phase 12 performance anti-patterns
  ApiKey            — Phase 15 hashed API keys + auth accounts
  RequestLog        — Phase 15 per-request usage tracking
"""
import logging
import uuid
from datetime import datetime
from typing import AsyncGenerator

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger("helix.postgres")

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.APP_DEBUG,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Phase 1-4 core
# ---------------------------------------------------------------------------

class RepositoryModel(Base):
    __tablename__ = "repositories"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name             = Column(String(255), nullable=False)
    status           = Column(String(64), nullable=False, default="pending")
    source_type      = Column(String(32), nullable=False, default="upload")
    source_url       = Column(String(1024), nullable=True)
    storage_path     = Column(String(1024), nullable=True)
    owner_account_id = Column(String(64), nullable=True, index=True)
    file_count       = Column(Integer, default=0)
    function_count   = Column(Integer, default=0)
    class_count      = Column(Integer, default=0)
    dependency_count = Column(Integer, default=0)
    error_message    = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


# ---------------------------------------------------------------------------
# Phase 5-7 analysis
# ---------------------------------------------------------------------------

class SecurityFinding(Base):
    __tablename__ = "security_findings"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id     = Column(String(64), nullable=False, index=True)
    severity    = Column(String(16), nullable=False)
    file_path   = Column(String(1024), nullable=False)
    line_number = Column(Integer, nullable=True)
    issue_type  = Column(String(128), nullable=False)
    description = Column(Text, nullable=False)
    suggestion  = Column(Text, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)


class CodeSmell(Base):
    __tablename__ = "code_smells"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id     = Column(String(64), nullable=False, index=True)
    smell_type  = Column(String(128), nullable=False)
    severity    = Column(String(16), nullable=False)
    node_name   = Column(String(512), nullable=False)
    file_path   = Column(String(1024), nullable=False)
    description = Column(Text, nullable=False)
    suggestion  = Column(Text, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)


class HealthScore(Base):
    __tablename__ = "health_scores"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id               = Column(String(64), nullable=False, index=True)
    overall_score         = Column(Float, nullable=False)
    architecture_score    = Column(Float, nullable=False)
    maintainability_score = Column(Float, nullable=False)
    complexity_score      = Column(Float, nullable=False)
    security_score        = Column(Float, nullable=False)
    performance_score     = Column(Float, nullable=False)
    documentation_score   = Column(Float, nullable=False)
    breakdown             = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Phase 11 — Git
# ---------------------------------------------------------------------------

class GitCommit(Base):
    __tablename__ = "git_commits"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id       = Column(String(64), nullable=False, index=True)
    commit_hash   = Column(String(64), nullable=False)
    author_name   = Column(String(255), nullable=True)
    author_email  = Column(String(255), nullable=True)
    message       = Column(Text, nullable=True)
    files_changed = Column(Text, nullable=True)  # JSON list of paths
    insertions    = Column(Integer, default=0)
    deletions     = Column(Integer, default=0)
    committed_at  = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Phase 12 — Performance
# ---------------------------------------------------------------------------

class PerformanceIssue(Base):
    __tablename__ = "performance_issues"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repo_id       = Column(String(64), nullable=False, index=True)
    pattern_type  = Column(String(128), nullable=False)
    severity      = Column(String(16), nullable=False)
    file_path     = Column(String(1024), nullable=False)
    function_name = Column(String(512), nullable=False)
    line_number   = Column(Integer, nullable=True)
    description   = Column(Text, nullable=False)
    suggestion    = Column(Text, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Phase 15 — Auth + Rate limiting
# ---------------------------------------------------------------------------

class ApiKey(Base):
    __tablename__ = "api_keys"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name          = Column(String(255), nullable=False)

    # Optional email/password auth
    email         = Column(String(255), nullable=True, unique=True, index=True)
    password_hash = Column(
        String(256),
        nullable=True,
    )  # bcrypt; None for key-only accounts

    # API key auth
    key_hash      = Column(String(256), nullable=False, unique=True)
    key_prefix    = Column(
        String(10),
        nullable=False,
    )  # first 8 chars for fast lookup

    is_active  = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    last_used  = Column(DateTime, nullable=True)


class RequestLog(Base):
    __tablename__ = "request_logs"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    api_key_prefix   = Column(String(10), nullable=True, index=True)
    endpoint         = Column(String(512), nullable=False)
    method           = Column(String(10), nullable=False)
    status_code      = Column(Integer, nullable=True)
    response_time_ms = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)


# ---------------------------------------------------------------------------
# Engine helpers
# ---------------------------------------------------------------------------

async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    await engine.dispose()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()