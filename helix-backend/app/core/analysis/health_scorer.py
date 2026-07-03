"""
Phase 7 — Project Health Scorer

Aggregates data from Neo4j, the security_findings table, and the
code_smells table to produce an overall health score (0-100) plus six
sub-scores:

  architecture      — circular deps, god classes, module separation
  maintainability   — long methods, duplicate logic, docstring coverage
  complexity        — average call-chain depth in the graph
  security          — per-finding severity deductions
  performance       — N+1 patterns, blocking calls in async functions
  documentation     — docstring %, README presence

Scores are stored in the `health_scores` PostgreSQL table.

curl example:
  POST /api/v1/analysis/health/{repo_id}
  GET  /api/v1/analysis/health/{repo_id}
"""
import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.graph.neo4j_client import neo4j_client
from app.db.postgres import CodeSmell, HealthScore, SecurityFinding

logger = logging.getLogger("helix.health_scorer")

# Severity → score deduction for security findings
_SECURITY_DEDUCTIONS = {"Critical": 20, "High": 15, "Medium": 8, "Low": 3}


@dataclass
class HealthReport:
    overall: float
    architecture: float
    maintainability: float
    complexity: float
    security: float
    performance: float
    documentation: float
    breakdown: Dict = field(default_factory=dict)


class HealthScorer:
    def __init__(self, repo_id: str, db: AsyncSession) -> None:
        self.repo_id = repo_id
        self.db = db

    async def score(self) -> HealthReport:
        # Remove previous score for this repo.
        await self.db.execute(delete(HealthScore).where(HealthScore.repo_id == self.repo_id))
        await self.db.commit()

        arch, arch_bd = await self._architecture_score()
        maint, maint_bd = await self._maintainability_score()
        comp, comp_bd = await self._complexity_score()
        sec, sec_bd = await self._security_score()
        perf, perf_bd = await self._performance_score()
        docs, docs_bd = await self._documentation_score()

        overall = round((arch + maint + comp + sec + perf + docs) / 6, 1)

        breakdown = {
            "architecture": arch_bd,
            "maintainability": maint_bd,
            "complexity": comp_bd,
            "security": sec_bd,
            "performance": perf_bd,
            "documentation": docs_bd,
        }

        report = HealthReport(
            overall=overall,
            architecture=arch,
            maintainability=maint,
            complexity=comp,
            security=sec,
            performance=perf,
            documentation=docs,
            breakdown=breakdown,
        )
        await self._persist(report)
        return report

    # ------------------------------------------------------------------
    # Sub-scorers
    # ------------------------------------------------------------------

    async def _architecture_score(self):
        score = 100.0
        bd = {}

        # Circular dependencies: -15 each
        circ = await self._count_smells("Circular Dependency")
        deduction = circ * 15
        score -= deduction
        bd["circular_dependencies"] = circ
        bd["circular_deduction"] = deduction

        # God classes: -10 each
        gods = await self._count_smells("God Class")
        god_deduction = gods * 10
        score -= god_deduction
        bd["god_classes"] = gods
        bd["god_class_deduction"] = god_deduction

        # Reward: check if there are multiple distinct modules/files
        file_count = await self._count_graph_nodes("File")
        if file_count >= 5:
            score = min(score + 10, 100)
            bd["module_separation_bonus"] = 10
        bd["file_count"] = file_count

        return max(round(score, 1), 0), bd

    async def _maintainability_score(self):
        score = 100.0
        bd = {}

        long_methods = await self._count_smells("Long Method")
        lm_deduction = long_methods * 5
        score -= lm_deduction
        bd["long_methods"] = long_methods
        bd["long_method_deduction"] = lm_deduction

        duplicates = await self._count_smells("Duplicate Logic")
        dup_deduction = duplicates * 8
        score -= dup_deduction
        bd["duplicate_logic"] = duplicates
        bd["duplicate_deduction"] = dup_deduction

        # Docstring coverage bonus (up to +20)
        doc_pct = await self._docstring_percentage()
        bonus = round(doc_pct * 0.2, 1)
        score = min(score + bonus, 100)
        bd["docstring_percentage"] = doc_pct
        bd["docstring_bonus"] = bonus

        return max(round(score, 1), 0), bd

    async def _complexity_score(self):
        """
        Score based on average call-chain depth.  We measure the average
        number of distinct functions each function in the repo CALLS.
        Higher average call count = higher interconnectedness = lower score.
        """
        score = 100.0
        bd = {}

        query = """
        MATCH (f:Function {repo_id: $repo_id})
        OPTIONAL MATCH (f)-[:CALLS]->(callee)
        WITH f, count(callee) AS call_count
        RETURN avg(call_count) AS avg_calls, max(call_count) AS max_calls
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
            avg_calls = rows[0].get("avg_calls") or 0
            max_calls = rows[0].get("max_calls") or 0
        except Exception:
            avg_calls = max_calls = 0

        # Penalise average fan-out > 3 (-5 per unit above 3)
        if avg_calls > 3:
            deduction = min((avg_calls - 3) * 5, 40)
            score -= deduction
            bd["avg_fanout_deduction"] = deduction
        # Penalise very deep single node (> 10 calls)
        if max_calls > 10:
            score -= min((max_calls - 10) * 2, 20)

        bd["avg_calls_per_function"] = round(avg_calls, 2)
        bd["max_calls_from_single_function"] = max_calls
        return max(round(score, 1), 0), bd

    async def _security_score(self):
        score = 100.0
        bd: Dict = {"findings": {}}

        result = await self.db.execute(
            select(SecurityFinding.severity).where(SecurityFinding.repo_id == self.repo_id)
        )
        severities = [row[0] for row in result.fetchall()]

        counts: Dict[str, int] = {}
        for sev in severities:
            counts[sev] = counts.get(sev, 0) + 1
            score -= _SECURITY_DEDUCTIONS.get(sev, 0)

        bd["findings"] = counts
        bd["total_findings"] = len(severities)
        return max(round(score, 1), 0), bd

    async def _performance_score(self):
        """
        Heuristic checks:
        1. N+1 pattern: a CALLS edge to a DB-like function from inside a loop
           (approximated by detecting functions that call query-named functions
           and are themselves called from within other functions).
        2. Blocking calls inside async functions.
        """
        score = 100.0
        bd = {}

        # N+1 approximation: async functions that call non-async DB-like functions
        query = """
        MATCH (caller:Function {repo_id: $repo_id, is_async: true})-[:CALLS]->(callee:Function {repo_id: $repo_id, is_async: false})
        WHERE callee.name =~ '(?i).*(query|fetch|select|find|get|load|read).*'
        RETURN count(*) AS n_plus_one_candidates
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
            n1 = rows[0].get("n_plus_one_candidates") or 0
        except Exception:
            n1 = 0

        n1_deduction = min(n1 * 8, 40)
        score -= n1_deduction
        bd["n_plus_one_candidates"] = n1
        bd["n_plus_one_deduction"] = n1_deduction

        # Blocking in async: async functions calling known blocking libs
        blocking_query = """
        MATCH (f:Function {repo_id: $repo_id, is_async: true})-[:CALLS]->(callee:Function)
        WHERE callee.name IN ['sleep', 'read', 'write', 'open', 'request', 'get', 'post']
          AND callee.is_async = false
        RETURN count(*) AS blocking_count
        """
        try:
            rows2 = await neo4j_client.execute_read(blocking_query, {"repo_id": self.repo_id})
            blocking = rows2[0].get("blocking_count") or 0
        except Exception:
            blocking = 0

        blocking_deduction = min(blocking * 5, 30)
        score -= blocking_deduction
        bd["blocking_calls_in_async"] = blocking
        bd["blocking_deduction"] = blocking_deduction

        return max(round(score, 1), 0), bd

    async def _documentation_score(self):
        score = 0.0
        bd = {}

        doc_pct = await self._docstring_percentage()
        score += doc_pct  # 0–100 directly from coverage
        bd["docstring_percentage"] = doc_pct

        # README bonus: +10 if a README exists as a File node
        readme_query = """
        MATCH (f:File {repo_id: $repo_id})
        WHERE toLower(f.path) CONTAINS 'readme'
        RETURN count(f) AS readme_count
        """
        try:
            rows = await neo4j_client.execute_read(readme_query, {"repo_id": self.repo_id})
            has_readme = (rows[0].get("readme_count") or 0) > 0
        except Exception:
            has_readme = False

        if has_readme:
            score = min(score + 10, 100)
            bd["readme_bonus"] = 10
        bd["has_readme"] = has_readme

        return max(round(score, 1), 0), bd

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    async def _count_smells(self, smell_type: str) -> int:
        result = await self.db.execute(
            select(CodeSmell).where(
                CodeSmell.repo_id == self.repo_id,
                CodeSmell.smell_type == smell_type,
            )
        )
        return len(result.scalars().all())

    async def _count_graph_nodes(self, label: str) -> int:
        query = f"MATCH (n:{label} {{repo_id: $repo_id}}) RETURN count(n) AS cnt"
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
            return rows[0].get("cnt") or 0
        except Exception:
            return 0

    async def _docstring_percentage(self) -> float:
        """Return 0-100 representing what % of functions/classes have docstrings."""
        query = """
        MATCH (n {repo_id: $repo_id})
        WHERE n:Function OR n:Class
        RETURN
          count(n) AS total,
          sum(CASE WHEN n.docstring IS NOT NULL AND n.docstring <> '' THEN 1 ELSE 0 END) AS with_docs
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
            total = rows[0].get("total") or 0
            with_docs = rows[0].get("with_docs") or 0
            return round((with_docs / total) * 100, 1) if total else 0.0
        except Exception:
            return 0.0

    async def _persist(self, report: HealthReport) -> None:
        self.db.add(HealthScore(
            id=uuid.uuid4(),
            repo_id=self.repo_id,
            overall_score=report.overall,
            architecture_score=report.architecture,
            maintainability_score=report.maintainability,
            complexity_score=report.complexity,
            security_score=report.security,
            performance_score=report.performance,
            documentation_score=report.documentation,
            breakdown=json.dumps(report.breakdown),
        ))
        await self.db.commit()
        logger.info("Persisted health score %.1f for repo %s", report.overall, self.repo_id)
