"""
Hybrid search combining FAISS vector similarity with Neo4j
graph/keyword lookups to find the most relevant code entities.
"""
import logging
import os
import pickle
import threading
from dataclasses import dataclass
from typing import Dict, List, Optional

import faiss
import numpy as np

from app.config import settings
from app.core.ai.embeddings import embedding_service
from app.core.graph.neo4j_client import neo4j_client

logger = logging.getLogger("helix.hybrid_search")


@dataclass
class SearchResult:
    entity_id: str
    name: str
    type: str
    file_path: str
    repo_id: str
    score: float


class HybridSearch:
    """
    Maintains a FAISS index of code-entity embeddings plus a metadata
    side-table, and supports combining vector similarity with
    Neo4j-backed keyword search as a fallback / complement.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._dim = settings.EMBEDDING_DIM
        self._index_path = settings.FAISS_INDEX_PATH
        self._index: Optional[faiss.Index] = None
        self._metadata: List[Dict] = []
        self._load_or_create()

    def _load_or_create(self) -> None:
        index_file = f"{self._index_path}.index"
        meta_file = f"{self._index_path}.meta"
        if os.path.exists(index_file) and os.path.exists(meta_file):
            try:
                self._index = faiss.read_index(index_file)
                with open(meta_file, "rb") as fh:
                    self._metadata = pickle.load(fh)
                logger.info("Loaded FAISS index with %d vectors.", len(self._metadata))
                return
            except Exception:
                logger.exception("Failed loading existing FAISS index; recreating it.")
        self._index = faiss.IndexFlatIP(self._dim)
        self._metadata = []

    def _persist(self) -> None:
        directory = os.path.dirname(self._index_path) or "."
        os.makedirs(directory, exist_ok=True)
        try:
            faiss.write_index(self._index, f"{self._index_path}.index")
            with open(f"{self._index_path}.meta", "wb") as fh:
                pickle.dump(self._metadata, fh)
        except Exception:
            logger.exception("Failed persisting FAISS index to disk.")

    async def add_entities(self, repo_id: str, entities: List[Dict]) -> None:
        """entities: list of dicts with keys: id, name, type, file_path, text"""
        if not entities:
            return
        texts = [e["text"] for e in entities]
        vectors = await embedding_service.embed_texts(texts)

        with self._lock:
            self._index.add(vectors)
            for e in entities:
                self._metadata.append(
                    {"id": e["id"], "name": e["name"], "type": e["type"], "file_path": e["file_path"], "repo_id": repo_id}
                )
            self._persist()

    async def vector_search(self, query: str, repo_id: Optional[str] = None, top_k: int = 10) -> List[SearchResult]:
        if self._index is None or self._index.ntotal == 0:
            return []
        query_vec = await embedding_service.embed_text(query)
        query_vec = np.expand_dims(query_vec, axis=0)

        with self._lock:
            search_k = min(top_k * 3, self._index.ntotal)
            scores, indices = self._index.search(query_vec, search_k)

        results: List[SearchResult] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self._metadata):
                continue
            meta = self._metadata[idx]
            if repo_id and meta["repo_id"] != repo_id:
                continue
            results.append(
                SearchResult(entity_id=meta["id"], name=meta["name"], type=meta["type"], file_path=meta["file_path"], repo_id=meta["repo_id"], score=float(score))
            )
            if len(results) >= top_k:
                break
        return results

    async def keyword_search(self, query: str, repo_id: str, top_k: int = 10) -> List[SearchResult]:
        """Fallback / complementary search using Neo4j name matching."""
        cypher = """
        MATCH (n)
        WHERE n.repo_id = $repo_id
          AND (n:Function OR n:Class)
          AND toLower(n.name) CONTAINS toLower($query)
        RETURN n.id AS id, n.name AS name, labels(n)[0] AS type, n.file_path AS file_path
        LIMIT $top_k
        """
        try:
            rows = await neo4j_client.execute_read(cypher, {"repo_id": repo_id, "query": query, "top_k": top_k})
        except Exception:
            logger.exception("Keyword search failed for repo %s", repo_id)
            return []
        return [
            SearchResult(entity_id=r["id"], name=r["name"], type=r["type"], file_path=r["file_path"], repo_id=repo_id, score=1.0)
            for r in rows
        ]

    async def search(self, query: str, repo_id: str, top_k: int = 10) -> List[SearchResult]:
        vector_results = await self.vector_search(query, repo_id=repo_id, top_k=top_k)
        if len(vector_results) >= top_k:
            return vector_results

        keyword_results = await self.keyword_search(query, repo_id=repo_id, top_k=top_k)
        seen_ids = {r.entity_id for r in vector_results}
        merged = vector_results + [r for r in keyword_results if r.entity_id not in seen_ids]
        return merged[:top_k]


hybrid_search = HybridSearch()
