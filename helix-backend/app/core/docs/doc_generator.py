"""
Phase 8 — Documentation Generator

Uses the Neo4j knowledge graph combined with Groq's LLM to generate
four types of documentation for any ingested repository:

  readme        — Project README.md (name, description, stack, how to run)
  api           — API surface docs (route functions, params, descriptions)
  architecture  — Module overview + Mermaid dependency diagram
  onboarding    — Entry points, key files, data-flow explanation

curl example:
  POST /api/v1/docs/generate/{repo_id}
  Body: {"doc_type": "readme"}

Returns: {"content": "<markdown>", "mermaid": "<optional diagram string>"}
"""
import logging
from typing import Dict, List, Optional, Tuple

from groq import AsyncGroq

from app.config import settings
from app.core.graph.neo4j_client import neo4j_client

logger = logging.getLogger("helix.doc_generator")

DOC_TYPES = {"readme", "api", "architecture", "onboarding"}


class DocGenerator:
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

    async def generate(self, doc_type: str) -> Dict:
        if doc_type not in DOC_TYPES:
            raise ValueError(f"doc_type must be one of {DOC_TYPES}")

        dispatch = {
            "readme": self._readme,
            "api": self._api_docs,
            "architecture": self._architecture,
            "onboarding": self._onboarding,
        }
        return await dispatch[doc_type]()

    # ------------------------------------------------------------------
    # README
    # ------------------------------------------------------------------

    async def _readme(self) -> Dict:
        summary = await self._repo_summary()
        prompt = f"""You are a technical writer. Generate a professional README.md for a software project.

Here is the codebase analysis:
{summary}

Generate a complete README.md with these sections:
1. Project title (infer a good name from the code)
2. Description (what this project does, inferred from the code)
3. Tech Stack (list the languages and key patterns you see)
4. Project Structure (key files and their purposes)
5. How to Run (generic instructions)
6. Key Features (inferred from the functions/classes)

Use proper Markdown formatting. Be concise but informative."""

        content = await self._llm(prompt)
        return {"content": content, "mermaid": None}

    # ------------------------------------------------------------------
    # API Docs
    # ------------------------------------------------------------------

    async def _api_docs(self) -> Dict:
        routes = await self._fetch_route_functions()
        if not routes:
            return {"content": "No route functions detected in this repository.", "mermaid": None}

        route_text = "\n".join(
            f"- {r['name']}({', '.join(r.get('parameters', []))}) in {r['file_path']}"
            + (f"\n  Docstring: {r['docstring']}" if r.get('docstring') else "")
            for r in routes
        )

        prompt = f"""You are a technical writer generating API documentation.

These are the route/handler functions found in the codebase:
{route_text}

Generate clean Markdown API documentation for each function. Include:
- Function name as heading
- File location
- Parameters and their likely types (infer from names)
- Description of what the endpoint likely does
- Example usage

Format as proper Markdown."""

        content = await self._llm(prompt)
        return {"content": content, "mermaid": None}

    # ------------------------------------------------------------------
    # Architecture Overview
    # ------------------------------------------------------------------

    async def _architecture(self) -> Dict:
        modules, deps = await self._fetch_module_dependencies()

        module_list = "\n".join(f"- {m}" for m in modules)
        dep_list = "\n".join(f"  {a} --> {b}" for a, b in deps[:50])

        mermaid = "graph TD\n" + "\n".join(
            f"  {self._safe_id(a)}[\"{a}\"] --> {self._safe_id(b)}[\"{b}\"]"
            for a, b in deps[:30]
        )

        prompt = f"""You are a software architect writing documentation.

Repository modules/files:
{module_list}

Import dependencies:
{dep_list}

Write a high-level Architecture Overview in Markdown:
1. System Overview (2-3 sentences)
2. Module Descriptions (one paragraph per key module)
3. Data Flow (how data moves through the system)
4. Key Design Patterns (what patterns you observe)

Be specific and reference actual file/module names."""

        content = await self._llm(prompt)
        return {"content": content, "mermaid": mermaid}

    # ------------------------------------------------------------------
    # Onboarding Guide
    # ------------------------------------------------------------------

    async def _onboarding(self) -> Dict:
        entry_points = await self._fetch_entry_points()
        key_files = await self._fetch_key_files()
        call_chains = await self._fetch_top_call_chains()

        ep_text = "\n".join(f"- {ep['name']} in {ep['file_path']}" for ep in entry_points)
        kf_text = "\n".join(f"- {kf['path']} ({kf.get('language','')}, {kf.get('loc',0)} lines)" for kf in key_files)
        cc_text = "\n".join(f"- {c['caller']} → {c['callee']}" for c in call_chains[:15])

        prompt = f"""You are a senior engineer writing an onboarding guide for a new developer.

Entry points of the application:
{ep_text or 'None detected'}

Key files (by size):
{kf_text}

Important call chains:
{cc_text or 'None detected'}

Write a friendly Onboarding Guide in Markdown:
1. Where to Start (which file to open first and why)
2. Core Concepts (key classes/functions to understand)
3. Data Flow Walkthrough (trace one request/operation end to end)
4. Common Tasks (how to add a new feature, based on existing patterns)
5. Gotchas (potential pitfalls visible from the code structure)

Use actual names from the codebase. Be practical and welcoming."""

        content = await self._llm(prompt)
        return {"content": content, "mermaid": None}

    # ------------------------------------------------------------------
    # LLM helper
    # ------------------------------------------------------------------

    async def _llm(self, prompt: str) -> str:
        try:
            response = await self.groq.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2048,
                temperature=0.3,
            )
            return response.choices[0].message.content or ""
        except Exception:
            logger.exception("Groq LLM call failed in doc generator.")
            return "Documentation generation failed. Check GROQ_API_KEY and try again."

    # ------------------------------------------------------------------
    # Graph data helpers
    # ------------------------------------------------------------------

    async def _repo_summary(self) -> str:
        query = """
        MATCH (f:File {repo_id: $repo_id})
        OPTIONAL MATCH (f)-[:CONTAINS]->(n)
        RETURN f.path AS path, f.language AS language, f.loc AS loc,
               collect(DISTINCT n.name)[..5] AS top_entities
        ORDER BY f.loc DESC LIMIT 20
        """
        try:
            rows = await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
        except Exception:
            return "No data available."
        return "\n".join(
            f"{r['path']} ({r.get('language','?')}, {r.get('loc',0)} lines): {', '.join(r.get('top_entities') or [])}"
            for r in rows
        )

    async def _fetch_route_functions(self) -> List[Dict]:
        """Detect route/handler functions by common naming conventions."""
        query = """
        MATCH (f:Function {repo_id: $repo_id})
        WHERE f.name =~ '(?i).*(route|handler|endpoint|view|controller|api|get_|post_|put_|delete_|patch_).*'
           OR f.file_path =~ '(?i).*(route|handler|view|controller|api).*'
        RETURN f.name AS name, f.file_path AS file_path,
               f.parameters AS parameters, f.docstring AS docstring
        LIMIT 50
        """
        try:
            return await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
        except Exception:
            return []

    async def _fetch_module_dependencies(self) -> Tuple[List[str], List[Tuple[str, str]]]:
        files_q = "MATCH (f:File {repo_id: $repo_id}) RETURN f.path AS path"
        deps_q = """
        MATCH (a:File {repo_id: $repo_id})-[:IMPORTS]->(b:File {repo_id: $repo_id})
        RETURN a.path AS src, b.path AS dst LIMIT 60
        """
        try:
            file_rows = await neo4j_client.execute_read(files_q, {"repo_id": self.repo_id})
            dep_rows = await neo4j_client.execute_read(deps_q, {"repo_id": self.repo_id})
        except Exception:
            return [], []
        modules = [r["path"] for r in file_rows if r.get("path")]
        deps = [(r["src"], r["dst"]) for r in dep_rows if r.get("src") and r.get("dst")]
        return modules, deps

    async def _fetch_entry_points(self) -> List[Dict]:
        query = """
        MATCH (f:Function {repo_id: $repo_id})
        WHERE f.name IN ['main', 'app', 'run', 'create_app', 'setup',
                         'handler', 'lambda_handler', 'start', 'index']
        RETURN f.name AS name, f.file_path AS file_path
        """
        try:
            return await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
        except Exception:
            return []

    async def _fetch_key_files(self) -> List[Dict]:
        query = """
        MATCH (f:File {repo_id: $repo_id})
        RETURN f.path AS path, f.language AS language, f.loc AS loc
        ORDER BY f.loc DESC LIMIT 10
        """
        try:
            return await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
        except Exception:
            return []

    async def _fetch_top_call_chains(self) -> List[Dict]:
        query = """
        MATCH (caller:Function {repo_id: $repo_id})-[:CALLS]->(callee:Function {repo_id: $repo_id})
        RETURN caller.name AS caller, callee.name AS callee,
               caller.file_path AS caller_file
        LIMIT 30
        """
        try:
            return await neo4j_client.execute_read(query, {"repo_id": self.repo_id})
        except Exception:
            return []

    @staticmethod
    def _safe_id(name: str) -> str:
        """Make a Mermaid-safe node identifier from a file path."""
        return name.replace("/", "_").replace(".", "_").replace("-", "_")
