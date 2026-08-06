"""
Read-only access to the Neo4j knowledge graph for a given repository.
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.core.graph.neo4j_client import neo4j_client

logger = logging.getLogger("helix.api.graph")
router = APIRouter()

_FORBIDDEN_KEYWORDS = ("CREATE", "MERGE", "DELETE", "SET", "DROP", "REMOVE", "DETACH")


@router.get("/{repo_id}/nodes")
async def get_nodes(repo_id: str, node_type: Optional[str] = Query(default=None), limit: int = Query(default=100, le=500)):
    label_filter = f":{node_type}" if node_type else ""
    query = f"""
    MATCH (n{label_filter})
    WHERE n.repo_id = $repo_id
    RETURN n, labels(n) AS labels
    LIMIT $limit
    """
    try:
        rows = await neo4j_client.execute_read(query, {"repo_id": repo_id, "limit": limit})
    except Exception:
        logger.exception("Failed fetching nodes for repo %s", repo_id)
        raise HTTPException(status_code=500, detail="Failed to query the graph.")
    return {"count": len(rows), "nodes": rows}


@router.get("/{repo_id}/relationships")
async def get_relationships(repo_id: str, rel_type: Optional[str] = Query(default=None), limit: int = Query(default=200, le=1000)):
    rel_filter = f":{rel_type}" if rel_type else ""
    query = f"""
    MATCH (a)-[r{rel_filter}]->(b)
    WHERE a.repo_id = $repo_id
    RETURN coalesce(a.id, a.path, a.name) AS source_id,
           type(r) AS type,
           coalesce(b.id, b.path, b.name) AS target_id
    LIMIT $limit
    """
    try:
        rows = await neo4j_client.execute_read(query, {"repo_id": repo_id, "limit": limit})
    except Exception:
        logger.exception("Failed fetching relationships for repo %s", repo_id)
        raise HTTPException(status_code=500, detail="Failed to query the graph.")
    return {"count": len(rows), "relationships": rows}


@router.get("/{repo_id}/file")
async def get_file_dependencies(repo_id: str, path: str = Query(...)):
    query = """
    MATCH (f:File {path: $path, repo_id: $repo_id})
    OPTIONAL MATCH (f)-[:CONTAINS]->(entity)
    OPTIONAL MATCH (f)-[:IMPORTS]->(dep)
    RETURN f.path AS path,
           collect(DISTINCT {id: entity.id, name: entity.name, type: labels(entity)[0]}) AS entities,
           collect(DISTINCT {id: dep.id, name: coalesce(dep.name, dep.path)}) AS dependencies
    """
    try:
        rows = await neo4j_client.execute_read(query, {"path": path, "repo_id": repo_id})
    except Exception:
        logger.exception("Failed fetching file dependencies for repo %s", repo_id)
        raise HTTPException(status_code=500, detail="Failed to query the graph.")
    if not rows:
        raise HTTPException(status_code=404, detail="File not found in graph.")
    return rows[0]


@router.post("/{repo_id}/query")
async def run_cypher_query(repo_id: str, cypher: str):
    upper = cypher.upper()
    if any(kw in upper for kw in _FORBIDDEN_KEYWORDS):
        raise HTTPException(status_code=400, detail="Only read-only Cypher queries are permitted.")
    try:
        rows = await neo4j_client.execute_read(cypher, {"repo_id": repo_id})
    except Exception as exc:
        logger.exception("Custom Cypher query failed for repo %s", repo_id)
        raise HTTPException(status_code=400, detail=f"Query failed: {exc}")
    return {"count": len(rows), "results": rows}
