"""
Pydantic models for repository ingestion requests/responses and
processing-status tracking.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class RepoStatus(str, Enum):
    PENDING = "pending"
    UPLOADING = "uploading"
    EXTRACTING = "extracting"
    PARSING = "parsing"
    BUILDING_GRAPH = "building_graph"
    GENERATING_EMBEDDINGS = "generating_embeddings"
    COMPLETED = "completed"
    FAILED = "failed"


class RepositoryCreate(BaseModel):
    name: str
    source_type: str = "upload"  # "upload" | "git"
    source_url: Optional[str] = None


class RepositoryOut(BaseModel):
    id: str
    name: str
    status: RepoStatus
    source_type: str
    source_url: Optional[str] = None
    file_count: int = 0
    function_count: int = 0
    class_count: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id_to_str(cls, value):
        # SQLAlchemy's UUID(as_uuid=True) column returns a uuid.UUID
        # instance, not a str. Pydantic v2's `str` type is strict and
        # will not auto-convert it, so it's coerced explicitly here.
        return str(value)


class ProcessingProgress(BaseModel):
    repo_id: str
    stage: RepoStatus
    progress: float = Field(ge=0, le=100)
    message: str
    detail: Optional[dict] = None
