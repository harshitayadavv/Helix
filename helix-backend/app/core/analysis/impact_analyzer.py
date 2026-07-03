"""
Phase 9 — Impact Analyzer

Given a File or Function node, computes its blast radius: which other
nodes would be affected if it changed or broke.

Uses Neo4j BFS (variable-length path) to discover:
  depth 1 — direct dependents  (IMPORTS or CALLS this node)
  depth 2 — indirect dependents
  depth 3 — transitive dependents

Risk score is based on the total count of affected nodes.
Groq generates a plain-English summary.

curl example:
  POST /api/v1/analysis/impact
  Body: {
    "repo_id": "...",
    "node_id": "operations.py::borrow_book::9",
    "node_type": "function"
  }
"""
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional

from groq import AsyncGroq

from app.config import settings
from app.core.graph.neo4j_client import neo4j_client

logger = logging.getLogger("helix.impact_analyzer")

_RISK_THRESHOLDS = [
    (0, "Low"),
    (3, "Medium"),
    (8, "High"),
    (15, "Critical"),
]

# Common API route name patterns
_ROUTE_PATTERNS = ["route", "endpoint", "handler", "view", "controller", "api"]


@dataclass
class AffectedNode:
    node_id: str
    name: str
    node_type: str
    file_path: str
    depth: int


@dataclass
class ImpactReport:
    source_node_id: str
    affected_nodes: List[AffectedNode]
    risk_score: str
    broken_endpoints: List[str]
    summary: str


class ImpactAnalyzer:
    def __init__(self, repo_id: str) -> None:
        self.repo_id = repo_id
        self._groq: Optional[AsyncGroq] = None

    @property
    def groq(self) -> AsyncGroq:
        if self._groq is None:
            if not settings.GROQ_API_KEY:
                raise RuntimeError("GROQ_API_KEY is not configured.")
            self._groq = AsyncGroq(api_key=settings.GROQ_API_KEY)
        return self._groq

    async def analyze(self, node_id: str, node_type: str) -> ImpactReport:
        affected = await self._bfs_dependents(node_id, node_type)
        risk = self._compute_risk(len(affected))
        endpoints = self._find_broken_endpoints(affected)
        summary = await self._generate_summary(node_id, affected, risk)

        return ImpactReport(
            source_node_id=node_id,
            affected_nodes=affected,
            risk_score=risk,
            broken_endpoints=endpoints,
            summary=summary,
        )

    # ------------------------------------------------------------------
    # BFS traversal
    # ------------------------------------------------------------------

    async def _bfs_dependents(self, node_id: str, node_type: str) -> List[AffectedNode]:
        """
        Find all nodes that depend on the given node up to 3 hops away.
        Cypher variable-length paths handle the BFS naturally.
        """
        if node_type.lower() == "file":
            query = """
            MATCH (source:File {repo_id: $repo_id})
            WHERE source.path = $node_id
            MATCH path = (dependent)-[:IMPORTS*1..3]->(source)
            WHERE dependent.repo_id = $repo_id
            WITH dependent, length(path) AS depth
            RETURN
              coalesce(dependent.id, dependent.path) AS node_id,
              coalesce(dependent.name, dependent.path) AS name,
              labels(dependent)[0] AS node_type,
              coalesce(dependent.file_path, dependent.path) AS file_path,
              min(depth) AS depth
            ORDER BY depth
            """
        else:
            query = """
            MATCH (source:Function {id: $node_id, repo_id: $repo_id})
            MATCH path = (dependent)-[:CALLS*1..3]->(source)
            WHERE dependent.repo_id = $repo_id
            WITH dependent, length(path) AS depth
            RETURN
              dependent.id AS node_id,
              dependent.name AS name,
              labels(dependent)[0] AS node_type,
              dependent.file_path AS file_path,
              min(depth) AS depth
            ORDER BY depth
            """

        try:
            rows = await neo4j_client.execute_read(query, {
                "repo_id": self.repo_id,
                "node_id": node_id,
            })
        except Exception:
            logger.exception("BFS impact traversal failed for node %s", node_id)
            return []

        seen = set()
        result = []
        for r in rows:
            nid = r.get("node_id") or ""
            if nid in seen:
                continue
            seen.add(nid)
            result.append(AffectedNode(
                node_id=nid,
                name=r.get("name") or nid,
                node_type=r.get("node_type") or "Unknown",
                file_path=r.get("file_path") or "unknown",
                depth=r.get("depth") or 1,
            ))
        return result

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _compute_risk(self, affected_count: int) -> str:
        risk = "Low"
        for threshold, label in _RISK_THRESHOLDS:
            if affected_count >= threshold:
                risk = label
        return risk

    def _find_broken_endpoints(self, affected: List[AffectedNode]) -> List[str]:
        endpoints = []
        for node in affected:
            name_lower = node.name.lower()
            if any(pat in name_lower for pat in _ROUTE_PATTERNS):
                endpoints.append(f"{node.name} ({node.file_path})")
        return endpoints

    async def _generate_summary(self, node_id: str, affected: List[AffectedNode], risk: str) -> str:
        if not settings.GROQ_API_KEY:
            return self._fallback_summary(node_id, affected, risk)

        depth_counts: Dict[int, int] = {}
        for n in affected:
            depth_counts[n.depth] = depth_counts.get(n.depth, 0) + 1

        affected_text = "\n".join(
            f"- [{n.node_type}] {n.name} in {n.file_path} (depth {n.depth})"
            for n in affected[:20]
        )
        if len(affected) > 20:
            affected_text += f"\n... and {len(affected) - 20} more."

        prompt = f"""A developer is about to change or delete this code node:
  Node: {node_id}
  Risk Level: {risk}
  Total affected nodes: {len(affected)}
  Depth breakdown: {depth_counts}

Affected dependents:
{affected_text or 'None found.'}

Write a concise (3-5 sentence) plain-English explanation of:
1. What will break if this node changes
2. Which parts of the codebase are most at risk
3. What the developer should check before making changes

Be specific, reference actual names, and be direct."""

        try:
            response = await self.groq.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=400,
                temperature=0.2,
            )
            return response.choices[0].message.content or self._fallback_summary(node_id, affected, risk)
        except Exception:
            logger.exception("Groq summary generation failed.")
            return self._fallback_summary(node_id, affected, risk)

    @staticmethod
    def _fallback_summary(node_id: str, affected: List[AffectedNode], risk: str) -> str:
        if not affected:
            return f"No dependents found for `{node_id}`. Changes to this node appear to be low risk."
        names = [n.name for n in affected[:5]]
        return (
            f"Changing `{node_id}` has a {risk} risk impact, affecting "
            f"{len(affected)} node(s) including: {', '.join(names)}."
        )
