"""
Phase 11 — Git API routes.

Endpoints:
  POST /api/v1/repositories/clone
  GET  /api/v1/repositories/{repo_id}/commits?limit=20&offset=0
  GET  /api/v1/repositories/{repo_id}/hotspots
  GET  /api/v1/repositories/{repo_id}/contributors

curl examples:
  curl -X POST http://localhost:8001/api/v1/repositories/clone \
    -H "Content-Type: application/json" \
    -d '{"github_url":"https://github.com/pallets/flask","branch":"main"}'

  curl "http://localhost:8001/api/v1/repositories/<id>/commits?limit=10"
  curl "http://localhost:8001/api/v1/repositories/<id>/hotspots"
  curl "http://localhost:8001/api/v1/repositories/<id>/contributors"
"""
import logging
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.git.git_analyzer import GitAnalyzer
from app.db.postgres import RepositoryModel, get_db
from app.models.repository import RepoStatus
from app.services.celery_tasks import process_repository_task

logger = logging.getLogger("helix.api.git")
router = APIRouter()


class CloneRequest(BaseModel):
    github_url: str
    branch: str = "main"
    name: Optional[str] = None   # override repo name; defaults to URL slug


@router.post("/clone", status_code=201)
async def clone_repository(payload: CloneRequest, db: AsyncSession = Depends(get_db)):
    """
    Clone a public GitHub / GitLab / Bitbucket repository and trigger
    the same ingestion pipeline as a ZIP upload.
    """
    repo_id = str(uuid.uuid4())
    repo_name = payload.name or payload.github_url.rstrip("/").split("/")[-1].removesuffix(".git")

    # Create DB record first so status is visible immediately.
    repo = RepositoryModel(
        id=repo_id,
        name=repo_name,
        status=RepoStatus.PENDING.value,
        source_type="git",
        source_url=payload.github_url,
    )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)

    # Perform the clone synchronously here (it's async / to_thread inside).
    analyzer = GitAnalyzer(repo_id=repo_id, db=db)
    try:
        clone_dir = await analyzer.clone(payload.github_url, payload.branch)
    except ValueError as exc:
        repo.status = RepoStatus.FAILED.value
        repo.error_message = str(exc)
        await db.commit()
        raise HTTPException(status_code=400, detail=str(exc))

    # Extract git history in the background (non-blocking).
    try:
        commits = await analyzer.extract_commits()
        await analyzer.persist_commits(commits)
    except Exception:
        logger.exception("Git log extraction failed for %s", repo_id)

    # Zip up the cloned source so the existing Celery pipeline can process it.
    zip_path = os.path.join(settings.REPO_STORAGE_PATH, repo_id, "upload.zip")
    try:
        import asyncio, zipfile
        src_dir = clone_dir

        def _zip():
            os.makedirs(os.path.dirname(zip_path), exist_ok=True)
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for root, _dirs, files in os.walk(src_dir):
                    for file in files:
                        abs_file = os.path.join(root, file)
                        arcname = os.path.relpath(abs_file, src_dir)
                        zf.write(abs_file, arcname)

        await asyncio.to_thread(_zip)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to package cloned repo: {exc}")

    # Dispatch the ingestion task.
    process_repository_task.delay(repo_id, zip_path)

    return {
        "id": str(repo.id),
        "name": repo.name,
        "status": repo.status,
        "source_url": repo.source_url,
        "commits_extracted": len(commits) if 'commits' in dir() else 0,
        "message": "Repository cloned. Ingestion pipeline started.",
    }


@router.get("/{repo_id}/commits")
async def get_commits(
    repo_id: str,
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Paginated git commit history for a repository."""
    analyzer = GitAnalyzer(repo_id=repo_id, db=db)
    commits, total = await analyzer.get_commits_paginated(limit=limit, offset=offset)
    return {
        "repo_id": repo_id,
        "total": total,
        "limit": limit,
        "offset": offset,
        "commits": commits,
    }


@router.get("/{repo_id}/hotspots")
async def get_hotspots(
    repo_id: str,
    top_n: int = Query(default=10, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Top N most frequently changed files (hotspot analysis)."""
    analyzer = GitAnalyzer(repo_id=repo_id, db=db)
    hotspots = await analyzer.get_hotspots(top_n=top_n)
    return {
        "repo_id": repo_id,
        "hotspots": [
            {
                "path": h.path,
                "change_count": h.change_count,
                "unique_authors": h.unique_authors,
            }
            for h in hotspots
        ],
    }


@router.get("/{repo_id}/contributors")
async def get_contributors(repo_id: str, db: AsyncSession = Depends(get_db)):
    """Contributor list with commit counts and owned files."""
    analyzer = GitAnalyzer(repo_id=repo_id, db=db)
    contributors = await analyzer.get_contributors()
    return {
        "repo_id": repo_id,
        "contributors": [
            {
                "name": c.name,
                "email": c.email,
                "commit_count": c.commit_count,
                "owned_files": c.owned_files,
            }
            for c in contributors
        ],
    }
