"""
Orchestrates the full repository ingestion pipeline:

  1. Unpack the uploaded repository archive.
  2. Walk the file tree and detect languages.
  3. Parse each supported file with tree-sitter.
  4. Build the Neo4j knowledge graph (nodes + relationships).
  5. Resolve cross-file import edges.
  6. Generate embeddings for functions/classes and index them in FAISS.

Progress is streamed to the frontend via the WebSocket manager at
every stage so a UI can render a live progress bar.
"""
import logging
import os
import shutil
import uuid
import zipfile
from typing import List

import aiofiles

from app.config import settings
from app.core.ai.embeddings import embedding_service
from app.core.graph.dependency_resolver import DependencyResolver
from app.core.graph.graph_builder import GraphBuilder
from app.core.parser.ast_parser import ast_parser
from app.core.parser.language_detector import is_supported_file
from app.core.search.hybrid_search import hybrid_search
from app.models.graph import ParsedFile
from app.models.repository import RepoStatus
from app.services.websocket_manager import websocket_manager

logger = logging.getLogger("helix.repo_processor")


class RepoProcessor:
    """Runs the end-to-end ingestion pipeline for a single repository."""

    def __init__(self, repo_id: str) -> None:
        self.repo_id = repo_id
        self.base_storage = os.path.join(settings.REPO_STORAGE_PATH, repo_id)

    async def process_zip_upload(self, zip_path: str) -> List[ParsedFile]:
        try:
            extract_dir = await self._extract_zip(zip_path)
            parsed_files = await self._parse_repository(extract_dir)
            await self._build_graph(parsed_files)
            await self._generate_embeddings(parsed_files)

            await websocket_manager.send_progress(self.repo_id, RepoStatus.COMPLETED.value, 100.0, "Processing complete.")
            return parsed_files
        except Exception as exc:
            logger.exception("Repository processing failed for %s", self.repo_id)
            await websocket_manager.send_error(self.repo_id, f"Processing failed: {exc}")
            raise

    async def _extract_zip(self, zip_path: str) -> str:
        await websocket_manager.send_progress(self.repo_id, RepoStatus.EXTRACTING.value, 5.0, "Extracting archive...")
        extract_dir = os.path.join(self.base_storage, "src")
        os.makedirs(extract_dir, exist_ok=True)

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                total_uncompressed = sum(info.file_size for info in zf.infolist())
                max_bytes = settings.MAX_REPO_SIZE_MB * 1024 * 1024
                if total_uncompressed > max_bytes:
                    raise ValueError(f"Repository exceeds the maximum allowed size of {settings.MAX_REPO_SIZE_MB}MB.")
                zf.extractall(extract_dir)
        except zipfile.BadZipFile as exc:
            raise ValueError("Uploaded file is not a valid zip archive.") from exc

        return extract_dir

    async def _parse_repository(self, root_dir: str) -> List[ParsedFile]:
        await websocket_manager.send_progress(self.repo_id, RepoStatus.PARSING.value, 15.0, "Scanning files...")

        file_paths: List[str] = []
        for current_root, _dirs, files in os.walk(root_dir):
            for filename in files:
                abs_path = os.path.join(current_root, filename)
                rel_path = os.path.relpath(abs_path, root_dir)
                if is_supported_file(rel_path):
                    file_paths.append(rel_path)

        parsed_files: List[ParsedFile] = []
        total = max(len(file_paths), 1)

        for i, rel_path in enumerate(file_paths):
            abs_path = os.path.join(root_dir, rel_path)
            try:
                async with aiofiles.open(abs_path, "r", encoding="utf-8", errors="replace") as fh:
                    content = await fh.read()
            except Exception:
                logger.warning("Could not read file %s, skipping.", abs_path)
                continue

            parsed = await ast_parser.parse_file_async(rel_path, content)
            parsed_files.append(parsed)

            progress = 15.0 + (i / total) * 35.0
            if i % 10 == 0 or i == total - 1:
                await websocket_manager.send_progress(self.repo_id, RepoStatus.PARSING.value, progress, f"Parsed {i + 1}/{total} files.")

        return parsed_files

    async def _build_graph(self, parsed_files: List[ParsedFile]) -> None:
        await websocket_manager.send_progress(self.repo_id, RepoStatus.BUILDING_GRAPH.value, 55.0, "Building knowledge graph...")

        builder = GraphBuilder(self.repo_id)
        await builder.build(parsed_files)

        resolver = DependencyResolver(self.repo_id, parsed_files)
        await resolver.link_file_imports()

        await websocket_manager.send_progress(self.repo_id, RepoStatus.BUILDING_GRAPH.value, 75.0, "Knowledge graph built.")

    async def _generate_embeddings(self, parsed_files: List[ParsedFile]) -> None:
        await websocket_manager.send_progress(self.repo_id, RepoStatus.GENERATING_EMBEDDINGS.value, 80.0, "Generating embeddings...")

        entities = []
        for pf in parsed_files:
            for fn in pf.functions:
                text = embedding_service.build_function_text(fn.name, fn.parameters, fn.docstring)
                entities.append({"id": fn.id, "name": fn.name, "type": "Function", "file_path": pf.path, "text": text})
            for cls in pf.classes:
                text = embedding_service.build_class_text(cls.name, cls.bases, cls.docstring)
                entities.append({"id": cls.id, "name": cls.name, "type": "Class", "file_path": pf.path, "text": text})
                for fn in cls.methods:
                    text = embedding_service.build_function_text(fn.name, fn.parameters, fn.docstring)
                    entities.append({"id": fn.id, "name": fn.name, "type": "Function", "file_path": pf.path, "text": text})

        if entities:
            await hybrid_search.add_entities(self.repo_id, entities)

        await websocket_manager.send_progress(
            self.repo_id, RepoStatus.GENERATING_EMBEDDINGS.value, 95.0, f"Indexed {len(entities)} code entities."
        )

    def cleanup(self) -> None:
        if os.path.isdir(self.base_storage):
            shutil.rmtree(self.base_storage, ignore_errors=True)


def new_repo_id() -> str:
    return str(uuid.uuid4())
