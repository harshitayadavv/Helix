"""
Phase 10 — Enhanced Hybrid Search

Combines FAISS vector similarity with Neo4j keyword lookups to find
the most relevant code entities. Enhancements over the original:

  - Search filters: node type (File/Function/Class/Module), language
  - Richer results: line numbers, docstring snippets, language
  - Search history: last 20 searches per repo stored in Redis
  - GET /api/v1/search/history/{repo_id}
"""
import json
import logging
import os
import pickle
import threading
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import faiss
import numpy as np
import redis.asyncio as aioredis

from app.config import settings
from app.core.ai.embeddings import embedding_service
from app.core.graph.neo4j_client import neo4j_client

logger = logging.getLogger("helix.hybrid_search")

SEARCH_HISTORY_MAX = 20


@dataclass
class SearchResult:
    entity_id: str
    name: str
    type: str
    file_path: str
    repo_id: str
    score: float
    # Enhanced fields
    line_number: Optional[int] = None
    language: Optional[str] = None
    description: Optional[str] = None   # first docstring line


@dataclass
class SearchMeta:
    """Metadata stored alongside each FAISS vector."""
    id: str
    name: str
    type: str
    file_path: str
    repo_id: str
    line_number: Optional[int] = None
    language: Optional[str] = None
    description: Optional[str] = None


class HybridSearch:
    """
    Maintains a FAISS index of code-entity embeddings plus a metadata
    side-table, supports type/language filtering, persists to disk, and
    logs search history to Redis.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._dim = settings.EMBEDDING_DIM
        self._index_path = settings.FAISS_INDEX_PATH
        self._index: Optional[faiss.Index] = None
        self._metadata: List[SearchMeta] = []
        self._redis: Optional[aioredis.Redis] = None
        self._load_or_create()

    def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        return self._redis

    def _load_or_create(self) -> None:
        index_file = f"{self._index_path}.index"
        meta_file = f"{self._index_path}.meta"
        if os.path.exists(index_file) and os.path.exists(meta_file):
            try:
                self._index = faiss.read_index(index_file)
                with open(meta_file, "rb") as fh:
                    raw = pickle.load(fh)
                # Migrate old dict-style metadata to SearchMeta dataclasses.
                self._metadata = []
                for item in raw:
                    if isinstance(item, dict):
                        self._metadata.append(SearchMeta(**{
                            k: item.get(k) for k in SearchMeta.__dataclass_fields__
                        }))
                    else:
                        self._metadata.append(item)
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
        """
        entities: list of dicts with keys:
          id, name, type, file_path, text
          (optional: line_number, language, description)
        """
        if not entities:
            return
        texts = [e["text"] for e in entities]
        vectors = await embedding_service.embed_texts(texts)

        with self._lock:
            self._index.add(vectors)
            for e in entities:
                self._metadata.append(SearchMeta(
                    id=e["id"],
                    name=e["name"],
                    type=e["type"],
                    file_path=e["file_path"],
                    repo_id=repo_id,
                    line_number=e.get("line_number"),
                    language=e.get("language"),
                    description=e.get("description"),
                ))
            self._persist()

    async def vector_search(
        self,
        query: str,
        repo_id: Optional[str] = None,
        top_k: int = 10,
        entity_type: Optional[str] = None,
        language: Optional[str] = None,
    ) -> List[SearchResult]:
        if self._index is None or self._index.ntotal == 0:
            return []

        query_vec = await embedding_service.embed_text(query)
        query_vec = np.expand_dims(query_vec, axis=0)

        with self._lock:
            search_k = min(top_k * 5, self._index.ntotal)
            scores, indices = self._index.search(query_vec, search_k)

        results: List[SearchResult] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self._metadata):
                continue
            meta = self._metadata[idx]
            if repo_id and meta.repo_id != repo_id:
                continue
            if entity_type and meta.type.lower() != entity_type.lower():
                continue
            if language and meta.language and meta.language.lower() != language.lower():
                continue
            results.append(SearchResult(
                entity_id=meta.id,
                name=meta.name,
                type=meta.type,
                file_path=meta.file_path,
                repo_id=meta.repo_id,
                score=float(score),
                line_number=meta.line_number,
                language=meta.language,
                description=meta.description,
            ))
            if len(results) >= top_k:
                break
        return results

    async def keyword_search(
        self,
        query: str,
        repo_id: str,
        top_k: int = 10,
        entity_type: Optional[str] = None,
        language: Optional[str] = None,
    ) -> List[SearchResult]:
        """Fallback / complementary search using Neo4j name matching."""
        type_filter = f"AND n:{entity_type}" if entity_type else ""
        lang_filter = "AND f.language = $language" if language else ""

        cypher = f"""
        MATCH (n)
        WHERE n.repo_id = $repo_id
          AND (n:Function OR n:Class OR n:File OR n:Module)
          AND toLower(n.name) CONTAINS toLower($query)
          {type_filter}
        OPTIONAL MATCH (f:File {{repo_id: $repo_id}}) WHERE f.path = n.file_path
          {lang_filter}
        RETURN n.id AS id, n.name AS name, labels(n)[0] AS type,
               n.file_path AS file_path,
               n.start_line AS line_number,
               n.docstring AS description,
               f.language AS language
        LIMIT $top_k
        """
        params = {"repo_id": repo_id, "query": query, "top_k": top_k}
        if language:
            params["language"] = language

        try:
            rows = await neo4j_client.execute_read(cypher, params)
        except Exception:
            logger.exception("Keyword search failed for repo %s", repo_id)
            return []

        return [
            SearchResult(
                entity_id=r.get("id") or r.get("name", ""),
                name=r.get("name", ""),
                type=r.get("type", "Unknown"),
                file_path=r.get("file_path") or "",
                repo_id=repo_id,
                score=1.0,
                line_number=r.get("line_number"),
                language=r.get("language"),
                description=r.get("description"),
            )
            for r in rows
        ]

    async def search(
        self,
        query: str,
        repo_id: str,
        top_k: int = 10,
        entity_type: Optional[str] = None,
        language: Optional[str] = None,
    ) -> List[SearchResult]:
        vector_results = await self.vector_search(
            query, repo_id=repo_id, top_k=top_k,
            entity_type=entity_type, language=language,
        )
        if len(vector_results) >= top_k:
            await self._record_history(repo_id, query, len(vector_results))
            return vector_results

        keyword_results = await self.keyword_search(
            query, repo_id=repo_id, top_k=top_k,
            entity_type=entity_type, language=language,
        )
        seen_ids = {r.entity_id for r in vector_results}
        merged = vector_results + [r for r in keyword_results if r.entity_id not in seen_ids]
        merged = merged[:top_k]

        await self._record_history(repo_id, query, len(merged))
        return merged

    # ------------------------------------------------------------------
    # Search history (Redis)
    # ------------------------------------------------------------------

    async def _record_history(self, repo_id: str, query: str, result_count: int) -> None:
        try:
            r = self._get_redis()
            key = f"helix:search_history:{repo_id}"
            entry = json.dumps({"query": query, "result_count": result_count})
            await r.lpush(key, entry)
            await r.ltrim(key, 0, SEARCH_HISTORY_MAX - 1)
        except Exception:
            logger.debug("Could not record search history: %s", query)

    async def get_history(self, repo_id: str) -> List[Dict]:
        try:
            r = self._get_redis()
            key = f"helix:search_history:{repo_id}"
            raw = await r.lrange(key, 0, SEARCH_HISTORY_MAX - 1)
            return [json.loads(entry) for entry in raw]
        except Exception:
            logger.debug("Could not retrieve search history for repo %s", repo_id)
            return []


hybrid_search = HybridSearch()
