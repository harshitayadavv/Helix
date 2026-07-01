"""
Repository ingestion endpoints: upload a codebase archive, track its
processing status, and list/delete previously ingested repositories.
"""
import logging
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.postgres import RepositoryModel, get_db
from app.models.repository import RepoStatus, RepositoryOut
from app.services.celery_tasks import process_repository_task

logger = logging.getLogger("helix.api.repository")
router = APIRouter()


@router.post("/upload", response_model=RepositoryOut, status_code=201)
async def upload_repository(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip archives are supported.")

    repo_id = str(uuid.uuid4())
    storage_dir = os.path.join(settings.REPO_STORAGE_PATH, repo_id)
    os.makedirs(storage_dir, exist_ok=True)
    zip_path = os.path.join(storage_dir, "upload.zip")

    try:
        contents = await file.read()
        if len(contents) > settings.MAX_REPO_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Uploaded archive is too large.")
        with open(zip_path, "wb") as fh:
            fh.write(contents)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed saving uploaded archive for repo %s", repo_id)
        raise HTTPException(status_code=500, detail="Failed to save uploaded file.")

    repo = RepositoryModel(
        id=repo_id,
        name=file.filename.removesuffix(".zip"),
        status=RepoStatus.PENDING.value,
        source_type="upload",
        storage_path=zip_path,
    )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)

    process_repository_task.delay(repo_id, zip_path)

    return repo


@router.get("/{repo_id}/status", response_model=RepositoryOut)
async def get_repository_status(repo_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RepositoryModel).where(RepositoryModel.id == repo_id))
    repo = result.scalar_one_or_none()
    if repo is None:
        raise HTTPException(status_code=404, detail="Repository not found.")
    return repo


@router.get("", response_model=list[RepositoryOut])
async def list_repositories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RepositoryModel).order_by(RepositoryModel.created_at.desc()))
    return result.scalars().all()


@router.delete("/{repo_id}", status_code=204)
async def delete_repository(repo_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RepositoryModel).where(RepositoryModel.id == repo_id))
    repo = result.scalar_one_or_none()
    if repo is None:
        raise HTTPException(status_code=404, detail="Repository not found.")
    await db.delete(repo)
    await db.commit()
    return None
