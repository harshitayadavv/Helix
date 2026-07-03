"""
Phase 5 — Security Analyzer

Scans parsed repository content (both raw file text and the Neo4j AST
graph) for common security vulnerabilities:

  - Hardcoded secrets   (password/secret/api_key/token literals)
  - SQL Injection        (string concatenation inside query functions)
  - XSS                  (unsanitized variables in HTML render calls)
  - Unsafe imports       (pickle, eval, exec, os.system, subprocess shell=True)
  - Weak auth patterns   (MD5 / SHA1 used for password hashing)

Findings are stored in the `security_findings` PostgreSQL table.

curl example:
  POST /api/v1/analysis/security/{repo_id}
  GET  /api/v1/analysis/security/{repo_id}
"""
import logging
import os
import re
import uuid
from dataclasses import dataclass
from typing import List, Optional

import aiofiles
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.graph.neo4j_client import neo4j_client
from app.db.postgres import SecurityFinding

logger = logging.getLogger("helix.security_analyzer")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Finding:
    severity: str           # Critical / High / Medium / Low
    file_path: str
    line_number: Optional[int]
    issue_type: str
    description: str
    suggestion: str


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

_SECRET_PATTERNS = [
    (re.compile(r'(?i)(password|passwd|pwd)\s*=\s*["\'][^"\']{4,}["\']'), "Hardcoded Password"),
    (re.compile(r'(?i)(secret|secret_key)\s*=\s*["\'][^"\']{4,}["\']'), "Hardcoded Secret"),
    (re.compile(r'(?i)(api_key|apikey)\s*=\s*["\'][^"\']{4,}["\']'), "Hardcoded API Key"),
    (re.compile(r'(?i)(token|auth_token|access_token)\s*=\s*["\'][^"\']{4,}["\']'), "Hardcoded Token"),
    (re.compile(r'(?i)(private_key|encryption_key)\s*=\s*["\'][^"\']{8,}["\']'), "Hardcoded Encryption Key"),
]

_SQL_INJECTION_PATTERNS = [
    re.compile(r'(?i)(execute|query|cursor\.execute)\s*\(\s*[f"\'].*(%s|\+|\.format|f["\'])'),
    re.compile(r'(?i)(execute|query)\s*\(\s*"[^"]*"\s*\+'),
    re.compile(r'(?i)cursor\.execute\s*\([^,)]*\+'),
]

_XSS_PATTERNS = [
    re.compile(r'(?i)(render_template|render|Markup|mark_safe)\s*\([^)]*request\.(args|form|get|POST|GET)'),
    re.compile(r'(?i)innerHTML\s*=\s*[^"\']\w+'),
    re.compile(r'(?i)document\.write\s*\(\s*\w+'),
]

_UNSAFE_IMPORTS = {
    "pickle": ("High", "pickle.loads can execute arbitrary code during deserialization.",
                "Use json or msgpack for serialization instead of pickle."),
    "eval": ("Critical", "eval() executes arbitrary Python code from a string.",
              "Replace eval() with ast.literal_eval() for safe literal parsing."),
    "exec": ("Critical", "exec() executes arbitrary Python code.",
              "Avoid exec(); refactor to use importlib or explicit function calls."),
}

_UNSAFE_CALL_PATTERNS = [
    (re.compile(r'os\.system\s*\('), "Critical",
     "os.system() passes commands directly to the shell.",
     "Use subprocess.run() with a list of arguments (shell=False)."),
    (re.compile(r'subprocess\.[A-Za-z_]+\s*\([^)]*shell\s*=\s*True'), "High",
     "subprocess with shell=True is vulnerable to shell injection.",
     "Use shell=False and pass arguments as a list."),
    (re.compile(r'(?i)hashlib\.(md5|sha1)\s*\([^)]*password'), "High",
     "MD5/SHA1 are cryptographically broken for password hashing.",
     "Use bcrypt, argon2, or hashlib.scrypt for password hashing."),
    (re.compile(r'(?i)hashlib\.(md5|sha1)\s*\('), "Medium",
     "MD5/SHA1 produce weak digests; avoid for security-sensitive hashing.",
     "Use SHA-256 or stronger (hashlib.sha256) for non-password digests."),
]


# ---------------------------------------------------------------------------
# Analyzer class
# ---------------------------------------------------------------------------

class SecurityAnalyzer:
    """Runs all security checks against a repository and stores findings."""

    def __init__(self, repo_id: str, db: AsyncSession) -> None:
        self.repo_id = repo_id
        self.db = db

    async def analyze(self) -> List[Finding]:
        """
        Run all security checks and persist findings.
        Returns the full list of Finding objects.
        """
        # Wipe any previous run for this repo.
        await self.db.execute(delete(SecurityFinding).where(SecurityFinding.repo_id == self.repo_id))
        await self.db.commit()

        findings: List[Finding] = []
        file_paths = await self._fetch_file_paths()

        for file_path in file_paths:
            abs_path = self._resolve_path(file_path)
            if abs_path is None:
                continue
            try:
                async with aiofiles.open(abs_path, "r", encoding="utf-8", errors="replace") as fh:
                    content = await fh.read()
                lines = content.splitlines()
            except Exception:
                logger.warning("Could not read file for security scan: %s", abs_path)
                continue

            findings.extend(self._scan_secrets(file_path, lines))
            findings.extend(self._scan_sql_injection(file_path, lines))
            findings.extend(self._scan_xss(file_path, lines))
            findings.extend(self._scan_unsafe_imports(file_path, lines))
            findings.extend(self._scan_unsafe_calls(file_path, lines))

        # Supplement with graph-based checks (imports stored in Neo4j).
        findings.extend(await self._check_graph_unsafe_imports())

        await self._persist(findings)
        return findings

    # ------------------------------------------------------------------
    # File-level scanners
    # ------------------------------------------------------------------

    def _scan_secrets(self, file_path: str, lines: List[str]) -> List[Finding]:
        results = []
        for i, line in enumerate(lines, 1):
            # Skip comment lines and test files.
            stripped = line.strip()
            if stripped.startswith(("#", "//", "*", "<!--")):
                continue
            if "test" in file_path.lower() or "example" in file_path.lower():
                continue
            for pattern, issue_name in _SECRET_PATTERNS:
                if pattern.search(line):
                    results.append(Finding(
                        severity="Critical",
                        file_path=file_path,
                        line_number=i,
                        issue_type="Hardcoded Secret",
                        description=f"{issue_name} detected: `{stripped[:120]}`",
                        suggestion="Move secrets to environment variables or a secrets manager (e.g. HashiCorp Vault, AWS Secrets Manager).",
                    ))
        return results

    def _scan_sql_injection(self, file_path: str, lines: List[str]) -> List[Finding]:
        results = []
        for i, line in enumerate(lines, 1):
            for pattern in _SQL_INJECTION_PATTERNS:
                if pattern.search(line):
                    results.append(Finding(
                        severity="Critical",
                        file_path=file_path,
                        line_number=i,
                        issue_type="SQL Injection",
                        description=f"Possible SQL injection via string concatenation: `{line.strip()[:120]}`",
                        suggestion="Use parameterized queries / prepared statements. Never concatenate user input into SQL.",
                    ))
                    break
        return results

    def _scan_xss(self, file_path: str, lines: List[str]) -> List[Finding]:
        results = []
        for i, line in enumerate(lines, 1):
            for pattern in _XSS_PATTERNS:
                if pattern.search(line):
                    results.append(Finding(
                        severity="High",
                        file_path=file_path,
                        line_number=i,
                        issue_type="XSS",
                        description=f"Unsanitized variable passed to render/HTML function: `{line.strip()[:120]}`",
                        suggestion="Escape or sanitize all user-controlled input before rendering HTML. Use Jinja2 auto-escaping or bleach.",
                    ))
                    break
        return results

    def _scan_unsafe_imports(self, file_path: str, lines: List[str]) -> List[Finding]:
        results = []
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            for module, (severity, description, suggestion) in _UNSAFE_IMPORTS.items():
                if re.search(rf'\b(import {module}|from {module}\b)', stripped):
                    results.append(Finding(
                        severity=severity,
                        file_path=file_path,
                        line_number=i,
                        issue_type="Unsafe Import",
                        description=f"Unsafe module `{module}` imported: {description}",
                        suggestion=suggestion,
                    ))
        return results

    def _scan_unsafe_calls(self, file_path: str, lines: List[str]) -> List[Finding]:
        results = []
        for i, line in enumerate(lines, 1):
            for pattern, severity, description, suggestion in _UNSAFE_CALL_PATTERNS:
                if pattern.search(line):
                    results.append(Finding(
                        severity=severity,
                        file_path=file_path,
                        line_number=i,
                        issue_type="Unsafe Call",
                        description=f"{description} Found at: `{line.strip()[:120]}`",
                        suggestion=suggestion,
                    ))
                    break
        return results

    # ------------------------------------------------------------------
    # Graph-based checks
    # ------------------------------------------------------------------

    async def _check_graph_unsafe_imports(self) -> List[Finding]:
        """
        Cross-reference the Neo4j IMPORTS graph to catch unsafe-module
        imports that the regex scan might miss (e.g. aliased imports).
        """
        query = """
        MATCH (f:File {repo_id: $repo_id})-[r:IMPORTS]->(m:Module)
        WHERE m.name IN ['pickle', 'subprocess', 'os', 'marshal', 'ctypes']
        RETURN f.path AS file_path, m.name AS module, r.names AS names
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
        except Exception:
            logger.exception("Graph unsafe-import check failed.")
            return []

        findings = []
        for row in rows:
            module = row.get("module", "")
            if module in _UNSAFE_IMPORTS:
                severity, description, suggestion = _UNSAFE_IMPORTS[module]
                findings.append(Finding(
                    severity=severity,
                    file_path=row.get("file_path", "unknown"),
                    line_number=None,
                    issue_type="Unsafe Import (graph)",
                    description=description,
                    suggestion=suggestion,
                ))
        return findings

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _fetch_file_paths(self) -> List[str]:
        query = "MATCH (f:File {repo_id: $repo_id}) RETURN f.path AS path"
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
            return [r["path"] for r in rows if r.get("path")]
        except Exception:
            logger.exception("Failed fetching file paths from Neo4j.")
            return []

    def _resolve_path(self, relative_path: str) -> Optional[str]:
        """Reconstruct the absolute path to the extracted source file."""
        base = os.path.join(settings.REPO_STORAGE_PATH, self.repo_id, "src")
        candidate = os.path.normpath(os.path.join(base, relative_path))
        return candidate if os.path.isfile(candidate) else None

    async def _persist(self, findings: List[Finding]) -> None:
        for f in findings:
            self.db.add(SecurityFinding(
                id=uuid.uuid4(),
                repo_id=self.repo_id,
                severity=f.severity,
                file_path=f.file_path,
                line_number=f.line_number,
                issue_type=f.issue_type,
                description=f.description,
                suggestion=f.suggestion,
            ))
        await self.db.commit()
        logger.info("Persisted %d security findings for repo %s", len(findings), self.repo_id)
