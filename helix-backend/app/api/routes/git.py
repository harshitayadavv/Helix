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
import asyncio
import logging
import os
import uuid
import zipfile
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.repository import _run_ingestion
from app.config import settings
from app.core.auth.auth_handler import get_current_account_id
from app.core.git.git_analyzer import GitAnalyzer
from app.db.postgres import AsyncSessionLocal, RepositoryModel, get_db
from app.models.repository import RepoStatus

logger = logging.getLogger("helix.api.git")
router = APIRouter()

_ALLOWED_HOSTS = ("https://github.com", "https://gitlab.com", "https://bitbucket.org")
_CLONE_TIMEOUT_SECONDS = 180.0


class CloneRequest(BaseModel):
    github_url: str
    branch: str = "main"
    name: Optional[str] = None   # override repo name; defaults to URL slug


def _humanize_git_error(raw: str) -> str:
    """
    Translate common raw git/GitPython stderr into a message a user can
    actually act on, instead of a wall of 'git clone -v --branch=...'
    plumbing output.
    """
    lower = raw.lower()
    if "not found in upstream origin" in lower or ("remote branch" in lower and "not found" in lower):
        return "That branch doesn't exist in this repository. Check the branch name (many repos use 'master' instead of 'main') and try again."
    if "repository not found" in lower or "could not read username" in lower or "authentication failed" in lower:
        return "Repository not found or it's private. Only public repositories are supported."
    if "could not resolve host" in lower:
        return "Couldn't reach that host. Check the URL and try again."
    if "no such file or directory" in lower:
        return "This repository's clone failed unexpectedly. Please try again."
    return "Failed to clone this repository. Check the URL and branch, then try again."


async def _mark_failed(repo_id: str, message: str) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(RepositoryModel)
            .where(RepositoryModel.id == repo_id)
            .values(status=RepoStatus.FAILED.value, error_message=message)
        )
        await db.commit()


async def _clone_and_prepare(repo_id: str, github_url: str, branch: str) -> str:
    """Clones the repo, extracts commit history, and zips the source for
    ingestion. Returns the path to the zip file. Raises ValueError on a
    clone failure (with the real git error attached), or any other
    exception on a packaging failure."""
    async with AsyncSessionLocal() as db:
        analyzer = GitAnalyzer(repo_id=repo_id, db=db)
        clone_dir = await analyzer.clone(github_url, branch)  # may raise ValueError

        try:
            commits = await analyzer.extract_commits()
            await analyzer.persist_commits(commits)
        except Exception:
            logger.exception("Git log extraction failed for %s", repo_id)

    zip_path = os.path.join(settings.REPO_STORAGE_PATH, repo_id, "upload.zip")

    def _zip():
        os.makedirs(os.path.dirname(zip_path), exist_ok=True)
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(clone_dir):
                for file in files:
                    abs_file = os.path.join(root, file)
                    arcname = os.path.relpath(abs_file, clone_dir)
                    zf.write(abs_file, arcname)

    await asyncio.to_thread(_zip)
    return zip_path


async def _run_clone_and_ingest(repo_id: str, github_url: str, branch: str) -> None:
    """
    Runs clone -> commit history -> zip -> ingest entirely in the
    background, mirroring the ZIP-upload flow. This used to run
    synchronously inside the HTTP request handler: on a slow clone or
    flaky network to the git host, that could exceed Render's proxy
    timeout, silently dropping the connection while the backend kept
    working — the frontend would then hang indefinitely with no
    success or failure ever delivered.

    Wrapped in a timeout so a genuinely hung clone (e.g. a network
    partition) fails loudly instead of leaving the repo stuck on
    'pending' forever with no explanation.
    """
    try:
        zip_path = await asyncio.wait_for(
            _clone_and_prepare(repo_id, github_url, branch),
            timeout=_CLONE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error("Clone timed out after %.0fs for repo %s (%s)", _CLONE_TIMEOUT_SECONDS, repo_id, github_url)
        await _mark_failed(
            repo_id,
            "Clone timed out — the repository may be too large or the connection too slow. Try again or use a smaller repo.",
        )
        return
    except ValueError as exc:
        # Log the REAL error server-side before showing the user a
        # friendly one. Previously the raw message was only used to
        # compute the friendly text and then discarded — meaning a
        # clone failure that didn't match one of the known patterns
        # showed the same generic fallback with zero way to diagnose
        # what actually went wrong.
        logger.exception("Clone failed for repo %s (%s)", repo_id, github_url)
        await _mark_failed(repo_id, _humanize_git_error(str(exc)))
        return
    except Exception as exc:
        logger.exception("Unexpected error preparing cloned repo %s (%s)", repo_id, github_url)
        await _mark_failed(repo_id, f"Failed to package cloned repo: {exc}")
        return

    await _run_ingestion(repo_id, zip_path)


@router.post("/clone", status_code=201)
async def clone_repository(
    payload: CloneRequest,
    db: AsyncSession = Depends(get_db),
    account_id: str = Depends(get_current_account_id),
):
    """
    Clone a public GitHub / GitLab / Bitbucket repository and trigger
    the same ingestion pipeline as a ZIP upload.

    Returns almost immediately with status=pending — the actual clone,
    commit history extraction, zipping, and ingestion all run in the
    background. Only cheap, instant validation (URL format) happens
    synchronously here.
    """
    if not payload.github_url.startswith(_ALLOWED_HOSTS):
        raise HTTPException(status_code=400, detail="Only public GitHub / GitLab / Bitbucket URLs are supported.")

    repo_id = str(uuid.uuid4())
    repo_name = payload.name or payload.github_url.rstrip("/").split("/")[-1].removesuffix(".git")

    repo = RepositoryModel(
        id=repo_id,
        name=repo_name,
        status=RepoStatus.PENDING.value,
        source_type="git",
        source_url=payload.github_url,
        owner_account_id=account_id,
    )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)

    asyncio.create_task(_run_clone_and_ingest(repo_id, payload.github_url, payload.branch))
    logger.info("Clone task created for repo %s (%s)", repo_id, payload.github_url)

    return {
        "id": str(repo.id),
        "name": repo.name,
        "status": repo.status,
        "source_url": repo.source_url,
        "message": "Clone started. Track progress from the dashboard.",
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