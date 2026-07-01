"""
Builds the Neo4j knowledge graph from ParsedFile results.

Node types    : File, Function, Class, Module
Relationships : CONTAINS, CALLS, INHERITS, IMPORTS
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

        for parsed in parsed_files:
            if parsed.error:
                logger.warning("Skipping graph build for %s due to parse error: %s", parsed.path, parsed.error)
                continue
            try:
                await self._upsert_file(parsed)
                await self._upsert_functions(parsed)
                await self._upsert_classes(parsed)
                await self._upsert_imports(parsed)
            except Exception:
                logger.exception("Failed building graph for file %s", parsed.path)

        # Second pass: CALLS edges need every Function node to exist first.
        await self._link_calls(parsed_files)

    async def _upsert_file(self, parsed: ParsedFile) -> None:
        query = """
        MERGE (f:File {path: $path, repo_id: $repo_id})
        SET f.language = $language, f.loc = $loc
        """
        await neo4j_client.execute_write(
            query, {"path": parsed.path, "repo_id": self.repo_id, "language": parsed.language, "loc": parsed.loc}
        )

    async def _upsert_functions(self, parsed: ParsedFile) -> None:
        if not parsed.functions:
            return
        query = """
        MATCH (f:File {path: $path, repo_id: $repo_id})
        UNWIND $functions AS fn
        MERGE (fn_node:Function {id: fn.id})
        SET fn_node.name = fn.name,
            fn_node.repo_id = $repo_id,
            fn_node.file_path = $path,
            fn_node.start_line = fn.start_line,
            fn_node.end_line = fn.end_line,
            fn_node.is_async = fn.is_async,
            fn_node.is_method = fn.is_method,
            fn_node.parameters = fn.parameters,
            fn_node.docstring = fn.docstring
        MERGE (f)-[:CONTAINS]->(fn_node)
        """
        await neo4j_client.execute_write(
            query,
            {
                "path": parsed.path,
                "repo_id": self.repo_id,
                "functions": [
                    {
                        "id": fn.id, "name": fn.name, "start_line": fn.start_line, "end_line": fn.end_line,
                        "is_async": fn.is_async, "is_method": fn.is_method, "parameters": fn.parameters,
                        "docstring": fn.docstring or "",
                    }
                    for fn in parsed.functions
                ],
            },
        )

    async def _upsert_classes(self, parsed: ParsedFile) -> None:
        if not parsed.classes:
            return
        for cls in parsed.classes:
            query = """
            MATCH (f:File {path: $path, repo_id: $repo_id})
            MERGE (c:Class {id: $id})
            SET c.name = $name, c.repo_id = $repo_id, c.file_path = $path,
                c.start_line = $start_line, c.end_line = $end_line, c.docstring = $docstring
            MERGE (f)-[:CONTAINS]->(c)
            WITH c
            UNWIND $methods AS m
            MERGE (mn:Function {id: m.id})
            SET mn.name = m.name, mn.repo_id = $repo_id, mn.file_path = $path,
                mn.start_line = m.start_line, mn.end_line = m.end_line,
                mn.is_async = m.is_async, mn.is_method = true, mn.parameters = m.parameters,
                mn.docstring = m.docstring
            MERGE (c)-[:CONTAINS]->(mn)
            """
            await neo4j_client.execute_write(
                query,
                {
                    "path": parsed.path, "repo_id": self.repo_id, "id": cls.id, "name": cls.name,
                    "start_line": cls.start_line, "end_line": cls.end_line, "docstring": cls.docstring or "",
                    "methods": [
                        {
                            "id": m.id, "name": m.name, "start_line": m.start_line, "end_line": m.end_line,
                            "is_async": m.is_async, "parameters": m.parameters, "docstring": m.docstring or "",
                        }
                        for m in cls.methods
                    ],
                },
            )

            if cls.bases:
                inherit_query = """
                MATCH (c:Class {id: $id})
                UNWIND $bases AS base_name
                MERGE (base:Class {name: base_name, repo_id: $repo_id})
                MERGE (c)-[:INHERITS]->(base)
                """
                await neo4j_client.execute_write(inherit_query, {"id": cls.id, "bases": cls.bases, "repo_id": self.repo_id})

    async def _upsert_imports(self, parsed: ParsedFile) -> None:
        if not parsed.imports:
            return
        query = """
        MATCH (f:File {path: $path, repo_id: $repo_id})
        UNWIND $imports AS imp
        MERGE (m:Module {name: imp.module, repo_id: $repo_id})
        MERGE (f)-[r:IMPORTS]->(m)
        SET r.names = imp.names, r.line = imp.line, r.alias = imp.alias
        """
        await neo4j_client.execute_write(
            query,
            {
                "path": parsed.path, "repo_id": self.repo_id,
                "imports": [
                    {"module": imp.module, "names": imp.names, "line": imp.line, "alias": imp.alias or ""}
                    for imp in parsed.imports
                ],
            },
        )

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
