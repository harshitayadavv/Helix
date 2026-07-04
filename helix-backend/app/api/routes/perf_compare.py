"""
Phase 12 — Performance analysis routes.
Phase 13 — Repository comparison route.

Endpoints:
  POST /api/v1/analysis/performance/{repo_id}
  GET  /api/v1/analysis/performance/{repo_id}
  GET  /api/v1/comparison/{repo_id_a}/{repo_id_b}

curl examples:
  curl -X POST http://localhost:8001/api/v1/analysis/performance/<repo_id>
  curl http://localhost:8001/api/v1/analysis/performance/<repo_id>
  curl http://localhost:8001/api/v1/comparison/<repo_id_a>/<repo_id_b>
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.analysis.performance_analyzer import PerformanceAnalyzer
from app.core.comparison.repo_comparator import RepoComparator
from app.db.postgres import PerformanceIssue, get_db

logger = logging.getLogger("helix.api.perf_compare")

# Use two separate routers so they mount at different prefixes in main.py
perf_router = APIRouter()
compare_router = APIRouter()


# ---------------------------------------------------------------------------
# Phase 12 — Performance
# ---------------------------------------------------------------------------

class PerformanceIssueOut(BaseModel):
    id: str
    pattern_type: str
    severity: str
    file_path: str
    function_name: str
    line_number: Optional[int]
    description: str
    suggestion: str

    class Config:
        from_attributes = True


@perf_router.post("/performance/{repo_id}", summary="Run performance analysis")
async def run_performance_analysis(repo_id: str, db: AsyncSession = Depends(get_db)):
    """
    Scans for N+1 queries, blocking calls in async functions,
    nested loops, and object creation inside loops.
    """
    analyzer = PerformanceAnalyzer(repo_id=repo_id, db=db)
    try:
        issues = await analyzer.analyze()
    except Exception as exc:
        logger.exception("Performance analysis failed for repo %s", repo_id)
        raise HTTPException(status_code=500, detail=str(exc))

    summary: dict = {}
    for i in issues:
        summary[i.pattern_type] = summary.get(i.pattern_type, 0) + 1

    return {
        "repo_id": repo_id,
        "total_issues": len(issues),
        "summary": summary,
        "issues": [
            {
                "pattern_type": i.pattern_type,
                "severity": i.severity,
                "file_path": i.file_path,
                "function_name": i.function_name,
                "line_number": i.line_number,
                "description": i.description,
                "suggestion": i.suggestion,
            }
            for i in issues
        ],
    }


@perf_router.get("/performance/{repo_id}", response_model=List[PerformanceIssueOut])
async def get_performance_issues(repo_id: str, db: AsyncSession = Depends(get_db)):
    """Return all stored performance issues for a repository."""
    result = await db.execute(
        select(PerformanceIssue)
        .where(PerformanceIssue.repo_id == repo_id)
        .order_by(PerformanceIssue.severity, PerformanceIssue.file_path)
    )
    rows = result.scalars().all()
    return [
        PerformanceIssueOut(
            id=str(r.id),
            pattern_type=r.pattern_type,
            severity=r.severity,
            file_path=r.file_path,
            function_name=r.function_name,
            line_number=r.line_number,
            description=r.description,
            suggestion=r.suggestion,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Phase 13 — Comparison
# ---------------------------------------------------------------------------

@compare_router.get("/{repo_id_a}/{repo_id_b}", summary="Compare two repositories")
async def compare_repositories(
    repo_id_a: str,
    repo_id_b: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Side-by-side comparison of two indexed repositories.
    Returns size, complexity, health, security, smells, and dependency
    metrics structured for frontend charts.

    Note: run health + security + smell analysis on both repos first
    for a complete comparison.
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
