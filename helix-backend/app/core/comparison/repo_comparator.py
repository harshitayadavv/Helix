"""
Phase 13 — Repository Comparator

Compares two already-indexed repositories across:
  - Size metrics    (files, functions, classes, modules)
  - Avg function length
  - Health scores   (side-by-side)
  - Security findings by severity
  - Code smells by type
  - Common & unique dependencies

Returns a structured comparison object ready for frontend charts.

curl example:
  GET /api/v1/comparison/{repo_id_a}/{repo_id_b}
"""
import json
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.graph.neo4j_client import neo4j_client
from app.db.postgres import CodeSmell, HealthScore, SecurityFinding

logger = logging.getLogger("helix.repo_comparator")


@dataclass
class RepoMetrics:
    repo_id: str
    file_count: int = 0
    function_count: int = 0
    class_count: int = 0
    module_count: int = 0
    avg_function_lines: float = 0.0
    avg_calls_per_function: float = 0.0
    health_overall: Optional[float] = None
    health_scores: Dict = field(default_factory=dict)
    security_by_severity: Dict[str, int] = field(default_factory=dict)
    smells_by_type: Dict[str, int] = field(default_factory=dict)
    dependencies: Set[str] = field(default_factory=set)


class RepoComparator:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def compare(self, repo_id_a: str, repo_id_b: str) -> dict:
        metrics_a = await self._collect(repo_id_a)
        metrics_b = await self._collect(repo_id_b)

        common_deps = sorted(metrics_a.dependencies & metrics_b.dependencies)
        only_in_a = sorted(metrics_a.dependencies - metrics_b.dependencies)
        only_in_b = sorted(metrics_b.dependencies - metrics_a.dependencies)

        return {
            "repo_a": repo_id_a,
            "repo_b": repo_id_b,
            "size": {
                "files":     {"a": metrics_a.file_count,     "b": metrics_b.file_count,     "diff": metrics_a.file_count - metrics_b.file_count},
                "functions": {"a": metrics_a.function_count, "b": metrics_b.function_count, "diff": metrics_a.function_count - metrics_b.function_count},
                "classes":   {"a": metrics_a.class_count,    "b": metrics_b.class_count,    "diff": metrics_a.class_count - metrics_b.class_count},
                "modules":   {"a": metrics_a.module_count,   "b": metrics_b.module_count,   "diff": metrics_a.module_count - metrics_b.module_count},
            },
            "complexity": {
                "avg_function_lines":      {"a": metrics_a.avg_function_lines,      "b": metrics_b.avg_function_lines},
                "avg_calls_per_function":  {"a": metrics_a.avg_calls_per_function,  "b": metrics_b.avg_calls_per_function},
            },
            "health": {
                "overall":         {"a": metrics_a.health_overall,        "b": metrics_b.health_overall},
                "architecture":    {"a": metrics_a.health_scores.get("architecture"),    "b": metrics_b.health_scores.get("architecture")},
                "maintainability": {"a": metrics_a.health_scores.get("maintainability"), "b": metrics_b.health_scores.get("maintainability")},
                "security":        {"a": metrics_a.health_scores.get("security"),        "b": metrics_b.health_scores.get("security")},
                "documentation":   {"a": metrics_a.health_scores.get("documentation"),   "b": metrics_b.health_scores.get("documentation")},
            },
            "security": {
                "a": metrics_a.security_by_severity,
                "b": metrics_b.security_by_severity,
            },
            "smells": {
                "a": metrics_a.smells_by_type,
                "b": metrics_b.smells_by_type,
            },
            "dependencies": {
                "common":    common_deps,
                "only_in_a": only_in_a,
                "only_in_b": only_in_b,
                "total_a":   len(metrics_a.dependencies),
                "total_b":   len(metrics_b.dependencies),
            },
        }

    # ------------------------------------------------------------------
    # Metric collection
    # ------------------------------------------------------------------

    async def _collect(self, repo_id: str) -> RepoMetrics:
        m = RepoMetrics(repo_id=repo_id)

        # --- Graph metrics ---
        counts = await self._graph_counts(repo_id)
        m.file_count     = counts.get("files", 0)
        m.function_count = counts.get("functions", 0)
        m.class_count    = counts.get("classes", 0)
        m.module_count   = counts.get("modules", 0)

        m.avg_function_lines    = await self._avg_function_lines(repo_id)
        m.avg_calls_per_function= await self._avg_calls(repo_id)
        m.dependencies          = await self._dependency_set(repo_id)

        # --- Postgres metrics ---
        m.health_overall, m.health_scores = await self._health(repo_id)
        m.security_by_severity = await self._security_counts(repo_id)
        m.smells_by_type       = await self._smell_counts(repo_id)

        return m

    async def _graph_counts(self, repo_id: str) -> Dict[str, int]:
        query = """
        MATCH (n {repo_id: $repo_id})
        RETURN
          sum(CASE WHEN n:File     THEN 1 ELSE 0 END) AS files,
          sum(CASE WHEN n:Function THEN 1 ELSE 0 END) AS functions,
          sum(CASE WHEN n:Class    THEN 1 ELSE 0 END) AS classes,
          sum(CASE WHEN n:Module   THEN 1 ELSE 0 END) AS modules
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": repo_id})
            return {k: int(rows[0].get(k) or 0) for k in ("files", "functions", "classes", "modules")}
        except Exception:
            return {}

    async def _avg_function_lines(self, repo_id: str) -> float:
        query = """
        MATCH (f:Function {repo_id: $repo_id})
        WHERE f.end_line IS NOT NULL AND f.start_line IS NOT NULL
        RETURN avg(f.end_line - f.start_line) AS avg_lines
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": repo_id})
            return round(rows[0].get("avg_lines") or 0.0, 2)
        except Exception:
            return 0.0

    async def _avg_calls(self, repo_id: str) -> float:
        query = """
        MATCH (f:Function {repo_id: $repo_id})
        OPTIONAL MATCH (f)-[:CALLS]->(callee)
        WITH f, count(callee) AS calls
        RETURN avg(calls) AS avg_calls
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": repo_id})
            return round(rows[0].get("avg_calls") or 0.0, 2)
        except Exception:
            return 0.0

    async def _dependency_set(self, repo_id: str) -> Set[str]:
        query = """
        MATCH (f:File {repo_id: $repo_id})-[:IMPORTS]->(m:Module)
        RETURN DISTINCT m.name AS dep
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": repo_id})
            return {r["dep"] for r in rows if r.get("dep")}
        except Exception:
            return set()

    async def _health(self, repo_id: str):
        result = await self.db.execute(
            select(HealthScore)
            .where(HealthScore.repo_id == repo_id)
            .order_by(HealthScore.created_at.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None, {}
        return row.overall_score, {
            "architecture":    row.architecture_score,
            "maintainability": row.maintainability_score,
            "complexity":      row.complexity_score,
            "security":        row.security_score,
            "performance":     row.performance_score,
            "documentation":   row.documentation_score,
        }

    async def _security_counts(self, repo_id: str) -> Dict[str, int]:
        result = await self.db.execute(
            select(SecurityFinding.severity).where(SecurityFinding.repo_id == repo_id)
        )
        counts: Dict[str, int] = {}
        for (sev,) in result.fetchall():
            counts[sev] = counts.get(sev, 0) + 1
        return counts

    async def _smell_counts(self, repo_id: str) -> Dict[str, int]:
        result = await self.db.execute(
            select(CodeSmell.smell_type).where(CodeSmell.repo_id == repo_id)
        )
        counts: Dict[str, int] = {}
        for (st,) in result.fetchall():
            counts[st] = counts.get(st, 0) + 1
        return counts
