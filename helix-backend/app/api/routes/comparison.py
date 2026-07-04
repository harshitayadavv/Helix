"""
Phase 13 — Repository Comparison route.

GET /api/v1/comparison/{repo_id_a}/{repo_id_b}

curl example:
  curl http://localhost:8001/api/v1/comparison/<repo_id_a>/<repo_id_b>
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.comparison.repo_comparator import RepoComparator
from app.db.postgres import get_db

logger = logging.getLogger("helix.api.comparison")
router = APIRouter()


@router.get("/{repo_id_a}/{repo_id_b}", summary="Compare two repositories")
async def compare_repositories(
    repo_id_a: str,
    repo_id_b: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Side-by-side comparison of two indexed repositories.
    Run health + security + smell analysis on both repos first for full results.
    """
    if repo_id_a == repo_id_b:
        raise HTTPException(status_code=400, detail="repo_id_a and repo_id_b must be different.")

    comparator = RepoComparator(db=db)
    try:
        result = await comparator.compare(repo_id_a, repo_id_b)
    except Exception as exc:
        logger.exception("Comparison failed for %s vs %s", repo_id_a, repo_id_b)
        raise HTTPException(status_code=500, detail=str(exc))

    return result
