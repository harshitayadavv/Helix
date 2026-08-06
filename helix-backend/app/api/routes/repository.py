"""
Repository ingestion endpoints: upload a codebase archive, track its
processing status, and list/delete previously ingested repositories.

Option A: uses asyncio.create_task instead of Celery for free-tier deployment.
"""
import asyncio
import logging
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.graph.neo4j_client import neo4j_client
from app.db.postgres import AsyncSessionLocal, RepositoryModel, get_db
from app.models.repository import RepoStatus, RepositoryOut
from app.services.repo_processor import RepoProcessor

logger = logging.getLogger("helix.api.repository")
router = APIRouter()


async def _run_ingestion(repo_id: str, zip_path: str) -> None:
    processor = RepoProcessor(repo_id)
    try:
        await neo4j_client.connect()
        parsed_files = await processor.process_zip_upload(zip_path)

        function_count = sum(
            len(pf.functions) + sum(len(c.methods) for c in pf.classes)
            for pf in parsed_files
        )
        class_count = sum(len(pf.classes) for pf in parsed_files)
        dependency_count = sum(len(pf.imports) for pf in parsed_files)

        async with AsyncSessionLocal() as db:
            await db.execute(
                update(RepositoryModel)
                .where(RepositoryModel.id == repo_id)
                .values(
                    status=RepoStatus.COMPLETED.value,
                    file_count=len(parsed_files),
                    function_count=function_count,
                    class_count=class_count,
                    dependency_count=dependency_count,
                )
            )
            await db.commit()
            
        logger.info("Ingestion complete for repo %s", repo_id)

    except Exception as exc:
        logger.exception("Ingestion pipeline failed for repo %s: %s", repo_id, exc)
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(
                    update(RepositoryModel)
                    .where(RepositoryModel.id == repo_id)
                    .values(status=RepoStatus.FAILED.value, error_message=str(exc))
                )
                await db.commit()
        except Exception:
            logger.exception("Failed to update repo status to FAILED for %s", repo_id)


@router.post("/upload", response_model=RepositoryOut, status_code=201)
async def upload_repository(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
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

    asyncio.create_task(_run_ingestion(repo_id, zip_path))
    logger.info("Ingestion task created for repo %s", repo_id)

    return repo


@router.get("/{repo_id}/status", response_model=RepositoryOut)
async def get_repository_status(repo_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RepositoryModel).where(RepositoryModel.id == repo_id)
    )
    repo = result.scalar_one_or_none()
    if repo is None:
        raise HTTPException(status_code=404, detail="Repository not found.")
    return repo


@router.get("", response_model=list[RepositoryOut])
async def list_repositories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RepositoryModel).order_by(RepositoryModel.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/{repo_id}", status_code=204)
async def delete_repository(repo_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RepositoryModel).where(RepositoryModel.id == repo_id)
    )
    repo = result.scalar_one_or_none()
    if repo is None:
        raise HTTPException(status_code=404, detail="Repository not found.")
    await db.delete(repo)
    await db.commit()
    return None