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
async def get_nodes(repo_id: str, node_type: Optional[str] = Query(default=None), limit: int = Query(default=500, le=1000)):
    label_filter = f":{node_type}" if node_type else ""
    # Ordered so File/Module/Class nodes are always returned before the
    # usually far more numerous Function nodes. Without this, an
    # unordered MATCH ... LIMIT on any repo with 100+ functions could
    # fill the entire limit with Function nodes before a single File or
    # Module was ever returned — Neo4j gives no ordering guarantee on
    # an unordered MATCH, so structural nodes (the ones that actually
    # anchor the layout and the frontend/backend split) could get
    # starved out entirely on larger repos, even though they were
    # written correctly during ingestion.
    query = f"""
    MATCH (n{label_filter})
    WHERE n.repo_id = $repo_id
    WITH n, labels(n) AS labels,
         CASE labels(n)[0]
           WHEN 'File' THEN 0
           WHEN 'Module' THEN 1
           WHEN 'Class' THEN 2
           ELSE 3
         END AS priority
    ORDER BY priority, coalesce(n.path, n.name)
    RETURN n, labels
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

@router.get("/{repo_id}/stats")
async def get_graph_stats(repo_id: str):
    node_query = """
    MATCH (n)
    WHERE n.repo_id = $repo_id
    RETURN labels(n)[0] AS label, count(n) AS count
    """
    edge_query = """
    MATCH (a)-[r:IMPORTS]->(b)
    WHERE a.repo_id = $repo_id
    RETURN count(r) AS count
    """
    try:
        node_rows = await neo4j_client.execute_read(node_query, {"repo_id": repo_id})
        edge_rows = await neo4j_client.execute_read(edge_query, {"repo_id": repo_id})
    except Exception:
        logger.exception("Failed fetching graph stats for repo %s", repo_id)
        raise HTTPException(status_code=500, detail="Failed to query the graph.")

    counts = {row["label"]: row["count"] for row in node_rows if row["label"]}
    dependency_count = edge_rows[0]["count"] if edge_rows else 0

    return {
        "file_count": counts.get("File", 0),
        "function_count": counts.get("Function", 0),
        "class_count": counts.get("Class", 0),
        "module_count": counts.get("Module", 0),
        "dependency_count": dependency_count,
    }

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
