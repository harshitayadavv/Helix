"""
Phase 10 — Enhanced Search API routes.

Endpoints:
  GET  /api/v1/search                        — hybrid semantic + keyword search
  GET  /api/v1/search/history/{repo_id}      — last 20 searches for a repo

New query params on /search:
  q          : search query (required)
  repo_id    : repository id (required)
  top_k      : max results (default 10, max 50)
  type       : filter by node type — Function | Class | File | Module
  language   : filter by language — python | javascript | typescript | java | cpp

curl examples:
  curl "http://localhost:8001/api/v1/search?repo_id=<id>&q=borrow+book"
  curl "http://localhost:8001/api/v1/search?repo_id=<id>&q=borrow&type=Function"
  curl "http://localhost:8001/api/v1/search?repo_id=<id>&q=book&language=python&top_k=5"
  curl "http://localhost:8001/api/v1/search/history/<repo_id>"
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.core.search.hybrid_search import hybrid_search

logger = logging.getLogger("helix.api.search")
router = APIRouter()

_VALID_TYPES = {"Function", "Class", "File", "Module"}
_VALID_LANGUAGES = {"python", "javascript", "typescript", "java", "cpp"}


@router.get("")
async def search_code(
    repo_id: str = Query(..., description="Repository ID"),
    q: str = Query(..., min_length=1, description="Search query"),
    top_k: int = Query(default=10, le=50, description="Max results to return"),
    type: Optional[str] = Query(default=None, description="Filter by node type: Function | Class | File | Module"),
    language: Optional[str] = Query(default=None, description="Filter by language: python | javascript | typescript | java | cpp"),
):
    """
    Hybrid semantic + keyword search over parsed code entities.
    Results include: name, type, file_path, line_number, language,
    description (first docstring line), and similarity score.
    """
    if type and type not in _VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type '{type}'. Valid values: {sorted(_VALID_TYPES)}"
        )
    if language and language.lower() not in _VALID_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid language '{language}'. Valid values: {sorted(_VALID_LANGUAGES)}"
        )

    try:
        results = await hybrid_search.search(
            query=q,
            repo_id=repo_id,
            top_k=top_k,
            entity_type=type,
            language=language.lower() if language else None,
        )
    except Exception:
        logger.exception("Search failed for repo %s, query=%s", repo_id, q)
        raise HTTPException(status_code=500, detail="Search failed.")

    return {
        "query": q,
        "filters": {"type": type, "language": language},
        "count": len(results),
        "results": [
            {
                "id": r.entity_id,
                "name": r.name,
                "type": r.type,
                "file_path": r.file_path,
                "line_number": r.line_number,
                "language": r.language,
                "description": r.description,
                "score": round(r.score, 4),
            }
            for r in results
        ],
    }


@router.get("/history/{repo_id}")
async def get_search_history(repo_id: str):
    """Returns the last 20 searches for a repository (stored in Redis)."""
    try:
        history = await hybrid_search.get_history(repo_id)
    except Exception:
        logger.exception("Failed fetching search history for repo %s", repo_id)
        raise HTTPException(status_code=500, detail="Could not retrieve search history.")

    return {
        "repo_id": repo_id,
        "count": len(history),
        "history": history,
    }
