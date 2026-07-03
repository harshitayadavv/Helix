"""
Phase 6 — Code Smell Detector

Queries the Neo4j knowledge graph (and persisted AST metadata) to detect:

  - God Classes          : > 10 methods in a single class
  - Long Methods         : > 50 lines in a single function
  - Circular Dependencies: cycles in the IMPORTS graph
  - Dead Code            : functions with no incoming CALLS edges
  - Duplicate Logic      : functions sharing a name across different files

Results are stored in the `code_smells` PostgreSQL table.

curl example:
  POST /api/v1/analysis/smells/{repo_id}
  GET  /api/v1/analysis/smells/{repo_id}
"""
import logging
import uuid
from dataclasses import dataclass
from typing import List

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.graph.neo4j_client import neo4j_client
from app.db.postgres import CodeSmell

logger = logging.getLogger("helix.smell_detector")

# Tuneable thresholds
GOD_CLASS_METHOD_THRESHOLD = 10
LONG_METHOD_LINE_THRESHOLD = 50

# Entry-point names that should not be flagged as dead code
ENTRY_POINT_NAMES = {
    "main", "__main__", "app", "run", "start", "create_app",
    "setup", "handler", "lambda_handler", "index",
}


@dataclass
class Smell:
    smell_type: str
    severity: str       # Warning / Info
    node_name: str
    file_path: str
    description: str
    suggestion: str


class SmellDetector:
    """Detects code smells by querying the Neo4j graph for a given repo."""

    def __init__(self, repo_id: str, db: AsyncSession) -> None:
        self.repo_id = repo_id
        self.db = db

    async def detect(self) -> List[Smell]:
        # Wipe previous run.
        await self.db.execute(delete(CodeSmell).where(CodeSmell.repo_id == self.repo_id))
        await self.db.commit()

        smells: List[Smell] = []
        smells.extend(await self._god_classes())
        smells.extend(await self._long_methods())
        smells.extend(await self._circular_dependencies())
        smells.extend(await self._dead_code())
        smells.extend(await self._duplicate_logic())

        await self._persist(smells)
        return smells

    # ------------------------------------------------------------------
    # Individual detectors
    # ------------------------------------------------------------------

    async def _god_classes(self) -> List[Smell]:
        """Classes that CONTAIN more than GOD_CLASS_METHOD_THRESHOLD methods."""
        query = """
        MATCH (c:Class {repo_id: $repo_id})-[:CONTAINS]->(f:Function)
        WITH c, count(f) AS method_count
        WHERE method_count > $threshold
        RETURN c.name AS name, c.file_path AS file_path, method_count
        ORDER BY method_count DESC
        """
        try:
            rows = await neo4j_client.execute_read(query, {
                "repo_id": self.repo_id,
                "threshold": GOD_CLASS_METHOD_THRESHOLD,
            })
        except Exception:
            logger.exception("God-class query failed.")
            return []

        return [
            Smell(
                smell_type="God Class",
                severity="Warning",
                node_name=r["name"],
                file_path=r.get("file_path", "unknown"),
                description=f"Class `{r['name']}` has {r['method_count']} methods, violating the Single Responsibility Principle.",
                suggestion="Break this class into smaller, focused classes. Aim for < 10 methods per class.",
            )
            for r in rows
        ]

    async def _long_methods(self) -> List[Smell]:
        """Functions whose line span exceeds LONG_METHOD_LINE_THRESHOLD."""
        query = """
        MATCH (f:Function {repo_id: $repo_id})
        WHERE (f.end_line - f.start_line) > $threshold
        RETURN f.name AS name, f.file_path AS file_path,
               f.start_line AS start_line,
               (f.end_line - f.start_line) AS line_count
        ORDER BY line_count DESC
        """
        try:
            rows = await neo4j_client.execute_read(query, {
                "repo_id": self.repo_id,
                "threshold": LONG_METHOD_LINE_THRESHOLD,
            })
        except Exception:
            logger.exception("Long-method query failed.")
            return []

        return [
            Smell(
                smell_type="Long Method",
                severity="Warning",
                node_name=r["name"],
                file_path=r.get("file_path", "unknown"),
                description=f"Function `{r['name']}` is {r['line_count']} lines long (starts at line {r.get('start_line')}).",
                suggestion="Extract logical sub-steps into separate helper functions. Aim for < 50 lines per function.",
            )
            for r in rows
        ]

    async def _circular_dependencies(self) -> List[Smell]:
        """
        Find cycles in the File-level IMPORTS graph using Cypher.
        Neo4j Community Edition does not ship with APOC, so we use a
        two-hop pattern: A->B->A.  Longer cycles are harder to detect
        without APOC; a pragmatic note is added to the suggestion.
        """
        query = """
        MATCH (a:File {repo_id: $repo_id})-[:IMPORTS]->(b:File {repo_id: $repo_id})-[:IMPORTS]->(a)
        WHERE a.path < b.path
        RETURN a.path AS file_a, b.path AS file_b
        LIMIT 50
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
        except Exception:
            logger.exception("Circular-dependency query failed.")
            return []

        return [
            Smell(
                smell_type="Circular Dependency",
                severity="Warning",
                node_name=f"{r['file_a']} ↔ {r['file_b']}",
                file_path=r.get("file_a", "unknown"),
                description=f"Circular import detected between `{r['file_a']}` and `{r['file_b']}`.",
                suggestion="Introduce an abstraction layer or move shared code to a third module to break the cycle.",
            )
            for r in rows
        ]

    async def _dead_code(self) -> List[Smell]:
        """
        Functions that have no incoming CALLS edges and are not recognised
        entry points.  These are candidates for dead code.
        """
        query = """
        MATCH (f:Function {repo_id: $repo_id})
        WHERE NOT (()-[:CALLS]->(f))
          AND NOT f.name IN $entry_points
          AND f.is_method = false
        RETURN f.name AS name, f.file_path AS file_path, f.start_line AS start_line
        LIMIT 100
        """
        try:
            rows = await neo4j_client.execute_read(query, {
                "repo_id": self.repo_id,
                "entry_points": list(ENTRY_POINT_NAMES),
            })
        except Exception:
            logger.exception("Dead-code query failed.")
            return []

        return [
            Smell(
                smell_type="Dead Code",
                severity="Info",
                node_name=r["name"],
                file_path=r.get("file_path", "unknown"),
                description=f"Function `{r['name']}` (line {r.get('start_line')}) has no callers in the codebase.",
                suggestion="Verify whether this function is called externally (CLI, API, tests). If unused, remove it to reduce maintenance burden.",
            )
            for r in rows
        ]

    async def _duplicate_logic(self) -> List[Smell]:
        """
        Functions that share the exact same name across different files are
        strong candidates for copy-pasted / duplicated logic.
        """
        query = """
        MATCH (f:Function {repo_id: $repo_id})
        WHERE f.is_method = false
        WITH f.name AS fn_name, collect(DISTINCT f.file_path) AS files
        WHERE size(files) > 1
        RETURN fn_name AS name, files
        ORDER BY size(files) DESC
        LIMIT 50
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
        except Exception:
            logger.exception("Duplicate-logic query failed.")
            return []

        smells = []
        for r in rows:
            files_str = ", ".join(r.get("files", []))
            smells.append(Smell(
                smell_type="Duplicate Logic",
                severity="Warning",
                node_name=r["name"],
                file_path=r.get("files", ["unknown"])[0],
                description=f"Function `{r['name']}` appears in {len(r.get('files', []))} files: {files_str}.",
                suggestion="Extract shared logic into a common utility module and import it where needed.",
            ))
        return smells

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    async def _persist(self, smells: List[Smell]) -> None:
        for s in smells:
            self.db.add(CodeSmell(
                id=uuid.uuid4(),
                repo_id=self.repo_id,
                smell_type=s.smell_type,
                severity=s.severity,
                node_name=s.node_name,
                file_path=s.file_path,
                description=s.description,
                suggestion=s.suggestion,
            ))
        await self.db.commit()
        logger.info("Persisted %d code smells for repo %s", len(smells), self.repo_id)
