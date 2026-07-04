"""
Phase 12 — Performance Analyzer

Detects performance anti-patterns by combining Neo4j graph queries
with regex/AST-style line-level scans of source files:

  1. N+1 Query Pattern     — DB query inside a loop
  2. Blocking async calls  — time.sleep / requests.get in async functions
  3. Expensive nested loops— for/while directly inside another for/while
  4. Object creation in loops — class instantiation inside loop bodies

Results stored in `performance_issues` PostgreSQL table.

curl examples:
  POST /api/v1/analysis/performance/{repo_id}
  GET  /api/v1/analysis/performance/{repo_id}
"""
import logging
import os
import re
import uuid
from dataclasses import dataclass
from typing import List, Optional

import aiofiles
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.graph.neo4j_client import neo4j_client
from app.db.postgres import PerformanceIssue

logger = logging.getLogger("helix.performance_analyzer")

# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

# Loop line detection
_LOOP_START = re.compile(r'^\s*(for |while )')

# DB-query-like function calls inside a loop body
_DB_CALL = re.compile(
    r'(?i)\b(query|execute|fetch|select|find|get|load|read|filter|all|first)\s*\('
)

# Blocking calls that shouldn't appear in async functions
_BLOCKING_CALLS = [
    (re.compile(r'\btime\.sleep\s*\('), "time.sleep()",
     "Use 'await asyncio.sleep()' inside async functions."),
    (re.compile(r'\brequests\.(get|post|put|delete|patch)\s*\('), "requests.*",
     "Use 'await httpx.AsyncClient' instead of 'requests' inside async functions."),
    (re.compile(r'\burllib\.request'), "urllib.request",
     "Use 'await httpx.AsyncClient' instead of urllib inside async functions."),
    (re.compile(r'\bopen\s*\([^)]*\)\s*(?!.*aiofiles)'), "open()",
     "Use 'aiofiles.open()' for file I/O inside async functions."),
]

# Object instantiation patterns (ClassName(...) or new ClassName(...))
_OBJECT_CREATION = re.compile(
    r'\b([A-Z][A-Za-z0-9_]+)\s*\(|new\s+[A-Z][A-Za-z0-9_]+\s*\('
)


@dataclass
class PerfIssue:
    pattern_type: str
    severity: str
    file_path: str
    function_name: str
    line_number: Optional[int]
    description: str
    suggestion: str


class PerformanceAnalyzer:
    def __init__(self, repo_id: str, db: AsyncSession) -> None:
        self.repo_id = repo_id
        self.db = db

    async def analyze(self) -> List[PerfIssue]:
        await self.db.execute(
            delete(PerformanceIssue).where(PerformanceIssue.repo_id == self.repo_id)
        )
        await self.db.commit()

        issues: List[PerfIssue] = []
        files = await self._fetch_files()

        for file_path, language, is_async_file in files:
            abs_path = self._resolve(file_path)
            if abs_path is None:
                continue
            try:
                async with aiofiles.open(abs_path, "r", encoding="utf-8", errors="replace") as fh:
                    content = await fh.read()
            except Exception:
                continue

            lines = content.splitlines()
            issues.extend(self._scan_n_plus_one(file_path, lines))
            issues.extend(self._scan_nested_loops(file_path, lines))
            issues.extend(self._scan_object_in_loop(file_path, lines))

        # Graph-based: blocking calls in async functions
        issues.extend(await self._graph_blocking_async())
        # Graph-based: N+1 via CALLS relationship (async → sync db)
        issues.extend(await self._graph_n_plus_one())

        await self._persist(issues)
        return issues

    # ------------------------------------------------------------------
    # File-level scanners
    # ------------------------------------------------------------------

    def _scan_n_plus_one(self, file_path: str, lines: List[str]) -> List[PerfIssue]:
        """Detect DB-query-like calls inside loop bodies."""
        issues = []
        in_loop = False
        loop_indent = 0

        for i, line in enumerate(lines, 1):
            stripped = line.lstrip()
            current_indent = len(line) - len(stripped)

            if _LOOP_START.match(line):
                in_loop = True
                loop_indent = current_indent
            elif in_loop and current_indent <= loop_indent and stripped and not stripped.startswith(("#", "//")):
                in_loop = False

            if in_loop and current_indent > loop_indent:
                if _DB_CALL.search(line):
                    issues.append(PerfIssue(
                        pattern_type="N+1 Query",
                        severity="High",
                        file_path=file_path,
                        function_name=self._enclosing_function(lines, i - 1),
                        line_number=i,
                        description=f"Potential N+1 query detected inside a loop at line {i}: `{line.strip()[:100]}`",
                        suggestion="Batch the query outside the loop, or use a bulk fetch and then iterate over results.",
                    ))
        return issues

    def _scan_nested_loops(self, file_path: str, lines: List[str]) -> List[PerfIssue]:
        """Detect for/while directly nested inside another for/while."""
        issues = []
        loop_stack: List[int] = []   # indentation levels of open loops

        for i, line in enumerate(lines, 1):
            stripped = line.lstrip()
            if not stripped:
                continue
            indent = len(line) - len(stripped)

            # Pop loops that have ended (dedent)
            loop_stack = [lvl for lvl in loop_stack if lvl < indent]

            if _LOOP_START.match(line):
                if loop_stack:   # already inside a loop → nested
                    issues.append(PerfIssue(
                        pattern_type="Nested Loop",
                        severity="Medium",
                        file_path=file_path,
                        function_name=self._enclosing_function(lines, i - 1),
                        line_number=i,
                        description=f"Nested loop detected at line {i} (O(n²) or worse): `{line.strip()[:100]}`",
                        suggestion="Refactor using dictionary lookups, sets, or vectorised operations to avoid O(n²) complexity.",
                    ))
                loop_stack.append(indent)
        return issues

    def _scan_object_in_loop(self, file_path: str, lines: List[str]) -> List[PerfIssue]:
        """Detect class instantiation inside loop bodies."""
        issues = []
        in_loop = False
        loop_indent = 0

        # Common built-ins that are fine to instantiate in loops
        _IGNORE = {"str", "int", "float", "bool", "list", "dict", "set", "tuple",
                   "Exception", "ValueError", "TypeError", "KeyError"}

        for i, line in enumerate(lines, 1):
            stripped = line.lstrip()
            indent = len(line) - len(stripped)

            if _LOOP_START.match(line):
                in_loop = True
                loop_indent = indent
            elif in_loop and indent <= loop_indent and stripped and not stripped.startswith(("#", "//")):
                in_loop = False

            if in_loop and indent > loop_indent:
                for match in _OBJECT_CREATION.finditer(line):
                    class_name = match.group(1) or ""
                    if class_name and class_name not in _IGNORE:
                        issues.append(PerfIssue(
                            pattern_type="Object Creation in Loop",
                            severity="Low",
                            file_path=file_path,
                            function_name=self._enclosing_function(lines, i - 1),
                            line_number=i,
                            description=f"Object `{class_name}` instantiated inside a loop at line {i}.",
                            suggestion=f"Consider pre-creating or reusing `{class_name}` instances outside the loop if the cost is non-trivial.",
                        ))
                        break   # one finding per line
        return issues

    # ------------------------------------------------------------------
    # Graph-based scanners
    # ------------------------------------------------------------------

    async def _graph_blocking_async(self) -> List[PerfIssue]:
        """Find async functions that CALL known blocking function names."""
        blocking_names = ["sleep", "get", "post", "put", "delete", "patch", "open", "read", "write"]
        query = """
        MATCH (caller:Function {repo_id: $repo_id, is_async: true})
              -[:CALLS]->(callee:Function {repo_id: $repo_id})
        WHERE callee.name IN $blocking_names
          AND callee.is_async = false
        RETURN caller.name AS fn_name, caller.file_path AS file_path,
               caller.start_line AS line_number, callee.name AS blocking_call
        LIMIT 50
        """
        try:
            rows = await neo4j_client.execute_read(query, {
                "repo_id": self.repo_id,
                "blocking_names": blocking_names,
            })
        except Exception:
            logger.exception("Graph blocking-async query failed.")
            return []

        issues = []
        for r in rows:
            blocking = r.get("blocking_call", "unknown")
            suggestion = next(
                (s for pat, name, s in _BLOCKING_CALLS if name and blocking in name), 
                "Replace with the async equivalent of this call."
            )
            issues.append(PerfIssue(
                pattern_type="Blocking Call in Async Function",
                severity="High",
                file_path=r.get("file_path") or "unknown",
                function_name=r.get("fn_name") or "unknown",
                line_number=r.get("line_number"),
                description=f"Async function `{r.get('fn_name')}` calls blocking `{blocking}()`.",
                suggestion=suggestion,
            ))
        return issues

    async def _graph_n_plus_one(self) -> List[PerfIssue]:
        """
        Graph-level N+1 signal: async callers that call multiple
        sync DB-named functions (each individual file scan may not
        see the full picture because the loop may span method boundaries).
        """
        query = """
        MATCH (caller:Function {repo_id: $repo_id})
              -[:CALLS]->(callee:Function {repo_id: $repo_id})
        WHERE callee.name =~ '(?i).*(query|fetch|select|find|filter|all|first).*'
        WITH caller, count(callee) AS db_call_count
        WHERE db_call_count >= 3
        RETURN caller.name AS fn_name, caller.file_path AS file_path,
               caller.start_line AS line_number, db_call_count
        ORDER BY db_call_count DESC LIMIT 20
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
        except Exception:
            logger.exception("Graph N+1 query failed.")
            return []

        return [
            PerfIssue(
                pattern_type="N+1 Query (graph)",
                severity="High",
                file_path=r.get("file_path") or "unknown",
                function_name=r.get("fn_name") or "unknown",
                line_number=r.get("line_number"),
                description=(
                    f"Function `{r.get('fn_name')}` calls {r.get('db_call_count')} "
                    "DB-like functions — possible N+1 pattern."
                ),
                suggestion="Consolidate DB calls using batch queries or eager loading.",
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _fetch_files(self):
        """Return (path, language, is_async) tuples for all repo files."""
        query = """
        MATCH (f:File {repo_id: $repo_id})
        RETURN f.path AS path, f.language AS language
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
            return [(r["path"], r.get("language", ""), False) for r in rows if r.get("path")]
        except Exception:
            return []

    def _resolve(self, relative_path: str) -> Optional[str]:
        base = os.path.join(settings.REPO_STORAGE_PATH, self.repo_id, "src")
        candidate = os.path.normpath(os.path.join(base, relative_path))
        return candidate if os.path.isfile(candidate) else None

    @staticmethod
    def _enclosing_function(lines: List[str], line_idx: int) -> str:
        """Walk backwards to find the nearest def/function declaration."""
        for i in range(line_idx, -1, -1):
            m = re.match(r'\s*(async\s+)?def\s+(\w+)', lines[i])
            if m:
                return m.group(2)
        return "module-level"

    async def _persist(self, issues: List[PerfIssue]) -> None:
        for issue in issues:
            self.db.add(PerformanceIssue(
                id=uuid.uuid4(),
                repo_id=self.repo_id,
                pattern_type=issue.pattern_type,
                severity=issue.severity,
                file_path=issue.file_path,
                function_name=issue.function_name,
                line_number=issue.line_number,
                description=issue.description,
                suggestion=issue.suggestion,
            ))
        await self.db.commit()
        logger.info("Persisted %d performance issues for repo %s", len(issues), self.repo_id)
