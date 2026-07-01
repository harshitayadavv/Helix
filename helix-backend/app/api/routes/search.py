"""
Hybrid semantic + keyword search over parsed code entities.
"""
import logging

from fastapi import APIRouter, HTTPException, Query

from app.core.search.hybrid_search import hybrid_search

logger = logging.getLogger("helix.api.search")
router = APIRouter()


@router.get("")
async def search_code(repo_id: str = Query(...), q: str = Query(..., min_length=1), top_k: int = Query(default=10, le=50)):
    try:
        results = await hybrid_search.search(q, repo_id=repo_id, top_k=top_k)
    except Exception:
        logger.exception("Search failed for repo %s, query=%s", repo_id, q)
        raise HTTPException(status_code=500, detail="Search failed.")
    return {
        "query": q,
        "count": len(results),
        "results": [
            {"id": r.entity_id, "name": r.name, "type": r.type, "file_path": r.file_path, "score": r.score}
            for r in results
        ],
    }
