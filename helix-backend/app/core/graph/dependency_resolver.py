"""
Resolves import statements to concrete File nodes within the same
repository, enabling File -> File IMPORTS edges in addition to the
raw Module-name nodes created by GraphBuilder.
"""
import logging
import os
from typing import Dict, List, Optional

from app.core.graph.neo4j_client import neo4j_client
from app.models.graph import ParsedFile

logger = logging.getLogger("helix.dependency_resolver")


class DependencyResolver:
    """Maps import module strings to actual files in the parsed repository."""

    def __init__(self, repo_id: str, parsed_files: List[ParsedFile]) -> None:
        self.repo_id = repo_id
        self.parsed_files = parsed_files
        self._known_paths = {pf.path for pf in parsed_files}
        self._loose_index = self._build_loose_index(parsed_files)

    @staticmethod
    def _build_loose_index(parsed_files: List[ParsedFile]) -> Dict[str, str]:
        """Maps a bare module/file basename (no extension) -> actual file path."""
        index: Dict[str, str] = {}
        for pf in parsed_files:
            stem = os.path.splitext(os.path.basename(pf.path))[0]
            index.setdefault(stem, pf.path)
        return index

    def resolve_module(self, importer_path: str, module: str, language: str, is_relative: bool) -> Optional[str]:
        """Best-effort resolution of an import string to a file path in this repo."""
        candidates: List[str] = []

        if language == "python":
            key = module.lstrip(".").replace(".", os.sep)
            candidates = [f"{key}.py", os.path.join(key, "__init__.py")]
        elif language in ("javascript", "typescript"):
            base_dir = os.path.dirname(importer_path) if is_relative else ""
            cleaned = module.lstrip("./")
            for ext in ("", ".js", ".ts", ".jsx", ".tsx", "/index.js", "/index.ts"):
                candidates.append(os.path.normpath(os.path.join(base_dir, cleaned + ext)))
        else:
            candidates = [module]

        for candidate in candidates:
            if candidate in self._known_paths:
                return candidate

        simple_key = module.split("/")[-1].split(".")[-1]
        return self._loose_index.get(simple_key)

    async def link_file_imports(self) -> None:
        """Create File -> File IMPORTS relationships where resolvable."""
        edges = []
        for pf in self.parsed_files:
            for imp in pf.imports:
                target = self.resolve_module(pf.path, imp.module, pf.language, imp.is_relative)
                if target and target != pf.path:
                    edges.append({"src": pf.path, "dst": target})

        if not edges:
            return

        query = """
        UNWIND $edges AS edge
        MATCH (src:File {path: edge.src, repo_id: $repo_id})
        MATCH (dst:File {path: edge.dst, repo_id: $repo_id})
        MERGE (src)-[:IMPORTS]->(dst)
        """
        try:
            await neo4j_client.execute_write(query, {"edges": edges, "repo_id": self.repo_id})
        except Exception:
            logger.exception("Failed linking resolved file imports for repo %s", self.repo_id)
