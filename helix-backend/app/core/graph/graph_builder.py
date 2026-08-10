"""
Builds the Neo4j knowledge graph from ParsedFile results.

Node types    : File, Function, Class, Module
Relationships : CONTAINS, CALLS, INHERITS, IMPORTS

Writes are batched across the whole repository (one UNWIND query per
node/relationship kind) rather than looped per file. The per-file loop
this replaced issued 4+ separate Neo4j round trips per file — fine for
a handful of files, but with Neo4j Aura hosted remotely, each round
trip pays full network latency, so a 20-file repo could take well over
a minute just in connection overhead before any real work happened.
Batching cuts total round trips from O(files) to roughly O(1).
"""
import logging
from typing import Dict, List

from app.core.graph.neo4j_client import neo4j_client
from app.models.graph import ParsedFile

logger = logging.getLogger("helix.graph_builder")


class GraphBuilder:
    """Persists parsed repository structure into Neo4j for a single repo_id."""

    def __init__(self, repo_id: str) -> None:
        self.repo_id = repo_id

    async def build(self, parsed_files: List[ParsedFile]) -> None:
        await neo4j_client.ensure_constraints()

        usable = [pf for pf in parsed_files if not pf.error]
        skipped = len(parsed_files) - len(usable)
        if skipped:
            logger.warning("Skipping graph build for %d file(s) with parse errors", skipped)

        try:
            await self._upsert_files(usable)
            await self._upsert_functions(usable)
            await self._upsert_classes_and_methods(usable)
            await self._upsert_inherits(usable)
            await self._upsert_imports(usable)
        except Exception:
            logger.exception("Failed building graph for repo %s", self.repo_id)

        # Final pass: CALLS edges need every Function node to exist first.
        await self._link_calls(usable)

    async def _upsert_files(self, parsed_files: List[ParsedFile]) -> None:
        if not parsed_files:
            return
        query = """
        UNWIND $files AS file
        MERGE (f:File {path: file.path, repo_id: $repo_id})
        SET f.language = file.language, f.loc = file.loc
        """
        await neo4j_client.execute_write(
            query,
            {
                "repo_id": self.repo_id,
                "files": [
                    {"path": pf.path, "language": pf.language, "loc": pf.loc}
                    for pf in parsed_files
                ],
            },
        )

    async def _upsert_functions(self, parsed_files: List[ParsedFile]) -> None:
        functions = [
            {
                "path": pf.path, "id": fn.id, "name": fn.name,
                "start_line": fn.start_line, "end_line": fn.end_line,
                "is_async": fn.is_async, "is_method": fn.is_method,
                "parameters": fn.parameters, "docstring": fn.docstring or "",
            }
            for pf in parsed_files for fn in pf.functions
        ]
        if not functions:
            return
        query = """
        UNWIND $functions AS fn
        MATCH (f:File {path: fn.path, repo_id: $repo_id})
        MERGE (fn_node:Function {id: fn.id})
        SET fn_node.name = fn.name,
            fn_node.repo_id = $repo_id,
            fn_node.file_path = fn.path,
            fn_node.start_line = fn.start_line,
            fn_node.end_line = fn.end_line,
            fn_node.is_async = fn.is_async,
            fn_node.is_method = fn.is_method,
            fn_node.parameters = fn.parameters,
            fn_node.docstring = fn.docstring
        MERGE (f)-[:CONTAINS]->(fn_node)
        """
        await neo4j_client.execute_write(query, {"repo_id": self.repo_id, "functions": functions})

    async def _upsert_classes_and_methods(self, parsed_files: List[ParsedFile]) -> None:
        classes = [
            {
                "path": pf.path, "id": cls.id, "name": cls.name,
                "start_line": cls.start_line, "end_line": cls.end_line,
                "docstring": cls.docstring or "",
            }
            for pf in parsed_files for cls in pf.classes
        ]
        if classes:
            class_query = """
            UNWIND $classes AS cls
            MATCH (f:File {path: cls.path, repo_id: $repo_id})
            MERGE (c:Class {id: cls.id})
            SET c.name = cls.name, c.repo_id = $repo_id, c.file_path = cls.path,
                c.start_line = cls.start_line, c.end_line = cls.end_line, c.docstring = cls.docstring
            MERGE (f)-[:CONTAINS]->(c)
            """
            await neo4j_client.execute_write(class_query, {"repo_id": self.repo_id, "classes": classes})

        methods = [
            {
                "class_id": cls.id, "path": pf.path, "id": m.id, "name": m.name,
                "start_line": m.start_line, "end_line": m.end_line,
                "is_async": m.is_async, "parameters": m.parameters, "docstring": m.docstring or "",
            }
            for pf in parsed_files for cls in pf.classes for m in cls.methods
        ]
        if methods:
            method_query = """
            UNWIND $methods AS m
            MATCH (c:Class {id: m.class_id})
            MERGE (mn:Function {id: m.id})
            SET mn.name = m.name, mn.repo_id = $repo_id, mn.file_path = m.path,
                mn.start_line = m.start_line, mn.end_line = m.end_line,
                mn.is_async = m.is_async, mn.is_method = true, mn.parameters = m.parameters,
                mn.docstring = m.docstring
            MERGE (c)-[:CONTAINS]->(mn)
            """
            await neo4j_client.execute_write(method_query, {"repo_id": self.repo_id, "methods": methods})

    async def _upsert_inherits(self, parsed_files: List[ParsedFile]) -> None:
        inherits = [
            {"class_id": cls.id, "base_name": base}
            for pf in parsed_files for cls in pf.classes for base in (cls.bases or [])
        ]
        if not inherits:
            return
        query = """
        UNWIND $inherits AS inh
        MATCH (c:Class {id: inh.class_id})
        MERGE (base:Class {name: inh.base_name, repo_id: $repo_id})
        MERGE (c)-[:INHERITS]->(base)
        """
        await neo4j_client.execute_write(query, {"repo_id": self.repo_id, "inherits": inherits})

    async def _upsert_imports(self, parsed_files: List[ParsedFile]) -> None:
        imports = [
            {
                "path": pf.path, "module": imp.module, "names": imp.names,
                "line": imp.line, "alias": imp.alias or "",
            }
            for pf in parsed_files for imp in pf.imports
        ]
        if not imports:
            return
        query = """
        UNWIND $imports AS imp
        MATCH (f:File {path: imp.path, repo_id: $repo_id})
        MERGE (m:Module {name: imp.module, repo_id: $repo_id})
        MERGE (f)-[r:IMPORTS]->(m)
        SET r.names = imp.names, r.line = imp.line, r.alias = imp.alias
        """
        await neo4j_client.execute_write(query, {"repo_id": self.repo_id, "imports": imports})

    async def _link_calls(self, parsed_files: List[ParsedFile]) -> None:
        """
        Resolve CALLS edges by matching callee names within the same repo.
        This intentionally favors simplicity over perfect resolution:
        same-named functions across files will all receive an edge, which
        is an acceptable trade-off for a code-intelligence overview graph.
        """
        all_calls: List[Dict] = []
        for parsed in parsed_files:
            for fn in parsed.functions:
                all_calls.extend({"caller_id": fn.id, "callee_name": name} for name in fn.calls)
            for cls in parsed.classes:
                for fn in cls.methods:
                    all_calls.extend({"caller_id": fn.id, "callee_name": name} for name in fn.calls)

        if not all_calls:
            return

        query = """
        UNWIND $calls AS call
        MATCH (caller:Function {id: call.caller_id})
        MATCH (callee:Function {name: call.callee_name, repo_id: $repo_id})
        MERGE (caller)-[:CALLS]->(callee)
        """
        try:
            await neo4j_client.execute_write(query, {"calls": all_calls, "repo_id": self.repo_id})
        except Exception:
            logger.exception("Failed linking CALLS edges for repo %s", self.repo_id)