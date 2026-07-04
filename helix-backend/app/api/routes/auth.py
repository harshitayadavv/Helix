"""
Phase 15 — Auth API routes (email + password + API key).

Endpoints (all public — no X-API-Key required except /usage):
  POST /api/v1/auth/register  — create account with email/password → api_key
  POST /api/v1/auth/login     — login with email/password → existing api_key
  GET  /api/v1/auth/usage     — request stats (requires X-API-Key)

Flow:
  1. Client calls /register with {email, password, name}
  2. Server hashes password (bcrypt), generates an API key, stores both.
  3. Client stores the api_key and sends it as X-API-Key on every request.
  4. Client can re-fetch their key anytime via /login.

curl examples:
  curl -X POST http://localhost:8001/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"dev@example.com","password":"secret123","name":"Alice"}'

  curl -X POST http://localhost:8001/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"dev@example.com","password":"secret123"}'

  curl -H "X-API-Key: hx_..." http://localhost:8001/api/v1/auth/usage
"""
import logging
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.auth_handler import (
    generate_api_key,
    get_api_key,
    hash_password,
    verify_password,
)
from app.db.postgres import ApiKey, RequestLog, get_db

logger = logging.getLogger("helix.api.auth")
router = APIRouter()

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not _EMAIL_RE.match(v.strip()):
            raise ValueError("Invalid email address.")
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if len(v.strip()) < 2:
            raise ValueError("Name must be at least 2 characters.")
        return v.strip()


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


class AuthResponse(BaseModel):
    api_key: str
    email: str
    name: str
    message: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/register", response_model=AuthResponse)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Create a new account.

    - Stores a bcrypt hash of the password (never the plain-text).
    - Generates a unique API key returned exactly once — store it securely.
    - Returns 409 if the email is already registered.
    """
    # Check duplicate email
    existing = await db.execute(
        select(ApiKey).where(ApiKey.email == payload.email)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists. Use /login instead.",
        )

    raw_key, key_hash, key_prefix = generate_api_key()
    pw_hash = hash_password(payload.password)

    db.add(ApiKey(
        id=uuid.uuid4(),
        name=payload.name,
        email=payload.email,
        password_hash=pw_hash,
        key_hash=key_hash,
        key_prefix=key_prefix,
        is_active=True,
    ))
    await db.commit()
    logger.info("New account registered: email=%s prefix=%s", payload.email, key_prefix)

    return AuthResponse(
        api_key=raw_key,
        email=payload.email,
        name=payload.name,
        message=(
            "Account created. "
            "Add 'X-API-Key: <api_key>' to all requests. "
            "This key will not be shown again — store it safely."
        ),
    )


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Login with email + password.

    Because the raw API key is never stored (only its bcrypt hash), we cannot
    return the original key. Instead we rotate the key on every login:
    a fresh API key is generated, the old hash is replaced, and the new raw
    key is returned. Clients should update their stored key after each login.
    """
    result = await db.execute(
        select(ApiKey).where(ApiKey.email == payload.email, ApiKey.is_active == True)
    )
    account = result.scalar_one_or_none()

    # Use a constant-time comparison failure path to avoid timing attacks.
    if account is None or not account.password_hash:
        # Still call verify_password with a dummy hash to spend the same time.
        verify_password(payload.password, "$2b$12$invalidhashpadding000000000000000000000000000000000000")
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not verify_password(payload.password, account.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    # Rotate the API key so the raw value can be returned.
    raw_key, key_hash, key_prefix = generate_api_key()
    await db.execute(
        update(ApiKey)
        .where(ApiKey.id == account.id)
        .values(
            key_hash=key_hash,
            key_prefix=key_prefix,
            last_used=datetime.utcnow(),
        )
    )
    await db.commit()
    logger.info("Login successful: email=%s new_prefix=%s", payload.email, key_prefix)

    return AuthResponse(
        api_key=raw_key,
        email=payload.email,
        name=account.name,
        message=(
            "Login successful. Your API key has been rotated. "
            "Update your stored key with the new value."
        ),
    )


@router.get("/usage")
async def get_usage(
    key_prefix: str = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Return request counts and average response times grouped by endpoint
    for the authenticated API key. Requires X-API-Key header.
    """
    if key_prefix is None:
        raise HTTPException(status_code=401, detail="X-API-Key required.")

    result = await db.execute(
        select(RequestLog)
        .where(RequestLog.api_key_prefix == key_prefix)
        .order_by(RequestLog.created_at.desc())
        .limit(1000)
    )
    logs = result.scalars().all()

    endpoint_counts: dict = {}
    endpoint_times: dict = {}

    for log in logs:
        key = f"{log.method} {log.endpoint}"
        endpoint_counts[key] = endpoint_counts.get(key, 0) + 1
        if log.response_time_ms:
            endpoint_times.setdefault(key, []).append(log.response_time_ms)

    avg_response_times = {
        k: round(sum(v) / len(v), 2) for k, v in endpoint_times.items()
    }

    return {
        "key_prefix": key_prefix,
        "total_requests": len(logs),
        "by_endpoint": endpoint_counts,
        "avg_response_ms": avg_response_times,
    }
