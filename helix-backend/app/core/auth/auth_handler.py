"""
Phase 15 — Auth Handler

Password hashing  : bcrypt directly (passlib removed — incompatible with bcrypt 4.x)
API key hashing   : SHA-256 (API keys are already high-entropy random strings;
                    bcrypt's 72-byte limit and slow hashing are unnecessary here)
Rate limiting     : Redis counters (100 req/min, 10 analysis/hr per key)
Usage tracking    : PostgreSQL RequestLog
"""
import hashlib
import logging
import secrets
import time
import uuid
from typing import Optional, Tuple

import bcrypt
import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request
from fastapi.security import APIKeyHeader
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.postgres import ApiKey, RequestLog, get_db

logger = logging.getLogger("helix.auth")

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

_PUBLIC_PATHS = {
    "/", "/health", "/docs", "/openapi.json",
    "/redoc", "/api/v1/auth/register", "/api/v1/auth/login",
}

_LIMIT_PER_MINUTE    = 100
_ANALYSIS_LIMIT_HOUR = 10

_ANALYSIS_PATHS = {
    "/api/v1/analysis/security",
    "/api/v1/analysis/smells",
    "/api/v1/analysis/health",
    "/api/v1/analysis/performance",
    "/api/v1/docs/generate",
}


# ---------------------------------------------------------------------------
# Password hashing  (bcrypt — slow by design, for user passwords)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a user password with bcrypt (cost factor 12)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time bcrypt password check."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# API key hashing  (SHA-256 — fast lookup, keys are already 256-bit random)
# ---------------------------------------------------------------------------

def _hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def verify_api_key(raw: str, key_hash: str) -> bool:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest() == key_hash


# ---------------------------------------------------------------------------
# Key generation
# ---------------------------------------------------------------------------

def generate_api_key() -> Tuple[str, str, str]:
    """
    Returns (raw_key, key_hash, key_prefix).
    raw_key    — shown to the user exactly once.
    key_hash   — SHA-256 hex digest stored in the DB.
    key_prefix — first 8 chars used for fast prefix lookups.
    """
    raw        = "hx_" + secrets.token_urlsafe(32)
    key_prefix = raw[:8]
    key_hash   = _hash_api_key(raw)
    return raw, key_hash, key_prefix


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

async def get_api_key(
    request: Request,
    raw_key: Optional[str] = Depends(api_key_header),
    db: AsyncSession = Depends(get_db),
) -> Optional[str]:
    """
    Dependency injected into every protected endpoint.
    Returns key_prefix on success; raises 401/429 on failure.
    """
    path = request.url.path

    if path in _PUBLIC_PATHS or path.startswith(("/docs", "/redoc", "/openapi")):
        return None

    if not raw_key:
        raise HTTPException(status_code=401, detail="X-API-Key header is required.")

    key_prefix = raw_key[:8]
    expected_hash = _hash_api_key(raw_key)

    result = await db.execute(
        select(ApiKey).where(
            ApiKey.key_prefix == key_prefix,
            ApiKey.key_hash   == expected_hash,
            ApiKey.is_active  == True,
        )
    )
    matched = result.scalar_one_or_none()
    if matched is None:
        raise HTTPException(status_code=401, detail="Invalid or inactive API key.")

    await _enforce_rate_limits(key_prefix, path)

    import datetime
    await db.execute(
        update(ApiKey)
        .where(ApiKey.id == matched.id)
        .values(last_used=datetime.datetime.utcnow())
    )

    start_time = getattr(request.state, "start_time", time.time())
    response_time_ms = round((time.time() - start_time) * 1000, 2)
    db.add(RequestLog(
        id=uuid.uuid4(),
        api_key_prefix=key_prefix,
        endpoint=path,
        method=request.method,
        response_time_ms=response_time_ms,
    ))
    await db.commit()

    return key_prefix

async def get_current_account_id(
    request: Request,
    raw_key: Optional[str] = Depends(api_key_header),
    db: AsyncSession = Depends(get_db),
) -> str:
    """
    Validates X-API-Key and returns the account's stable id (ApiKey.id),
    for use as an ownership reference on records like Repository.

    Deliberately separate from get_api_key's return value: that function
    returns key_prefix, which login() rotates on every call. Using
    key_prefix as an ownership key would silently orphan a user's own
    repositories the moment they logged in again. ApiKey.id never changes.
    """
    if not raw_key:
        raise HTTPException(status_code=401, detail="X-API-Key header is required.")

    key_prefix = raw_key[:8]
    expected_hash = _hash_api_key(raw_key)

    result = await db.execute(
        select(ApiKey).where(
            ApiKey.key_prefix == key_prefix,
            ApiKey.key_hash   == expected_hash,
            ApiKey.is_active  == True,
        )
    )
    matched = result.scalar_one_or_none()
    if matched is None:
        raise HTTPException(status_code=401, detail="Invalid or inactive API key.")

    return str(matched.id)

async def get_account_id_or_public(
    repo_id: str,
    request: Request,
    raw_key: Optional[str] = Depends(api_key_header),
    db: AsyncSession = Depends(get_db),
) -> Optional[str]:
    """
    Like get_current_account_id, but allows anonymous, unauthenticated
    access when repo_id matches the configured public demo repo — and
    ONLY that one repo. Every other repo_id still requires a valid
    X-API-Key exactly as before. Returns None for the public-demo case
    (there is no owning account); callers must treat a None account_id
    as "skip the ownership check, this is the public demo."
    """
    if settings.PUBLIC_DEMO_REPO_ID and repo_id == settings.PUBLIC_DEMO_REPO_ID:
        return None
    return await get_current_account_id(request=request, raw_key=raw_key, db=db)

async def _enforce_rate_limits(key_prefix: str, path: str) -> None:
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        minute_key = f"helix:rl:min:{key_prefix}:{int(time.time() // 60)}"
        count = await r.incr(minute_key)
        if count == 1:
            await r.expire(minute_key, 60)
        if count > _LIMIT_PER_MINUTE:
            retry_after = 60 - (int(time.time()) % 60)
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded: {_LIMIT_PER_MINUTE} requests/minute.",
                headers={"Retry-After": str(retry_after)},
            )

        if any(path.startswith(ap) for ap in _ANALYSIS_PATHS):
            hour_key = f"helix:rl:analysis:{key_prefix}:{int(time.time() // 3600)}"
            ac = await r.incr(hour_key)
            if ac == 1:
                await r.expire(hour_key, 3600)
            if ac > _ANALYSIS_LIMIT_HOUR:
                raise HTTPException(
                    status_code=429,
                    detail=f"Analysis rate limit exceeded: {_ANALYSIS_LIMIT_HOUR} runs/hour.",
                    headers={"Retry-After": str(3600 - (int(time.time()) % 3600))},
                )
    except HTTPException:
        raise
    except Exception:
        logger.debug("Redis rate-limit check failed; allowing request.")
    finally:
        await r.aclose()
