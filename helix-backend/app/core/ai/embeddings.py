"""
Generates dense embeddings for code entities (functions / classes)
using a sentence-transformers model. Model inference is CPU-bound,
so it is always run off the event loop via asyncio.to_thread.
"""
import asyncio
import logging
from functools import lru_cache
from typing import List, Optional

import numpy as np

from app.config import settings

logger = logging.getLogger("helix.embeddings")


@lru_cache
def _get_model():
    from sentence_transformers import SentenceTransformer
    logger.info("Loading embedding model: %s", settings.EMBEDDING_MODEL)
    return SentenceTransformer(settings.EMBEDDING_MODEL)


class EmbeddingService:
    """Thin async wrapper around a sentence-transformers model."""

    def __init__(self) -> None:
        self._dim = settings.EMBEDDING_DIM

    @property
    def dimension(self) -> int:
        return self._dim

    async def embed_texts(self, texts: List[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self._dim), dtype="float32")
        return await asyncio.to_thread(self._encode, texts)

    async def embed_text(self, text: str) -> np.ndarray:
        result = await self.embed_texts([text])
        return result[0]

    @staticmethod
    def _encode(texts: List[str]) -> np.ndarray:
        try:
            model = _get_model()
            embeddings = model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
            return embeddings.astype("float32")
        except Exception:
            logger.exception("Embedding generation failed.")
            raise

    @staticmethod
    def build_function_text(name: str, params: List[str], docstring: Optional[str], code_snippet: Optional[str] = None) -> str:
        parts = [f"function {name}({', '.join(params)})"]
        if docstring:
            parts.append(docstring)
        if code_snippet:
            parts.append(code_snippet[:300])
        return " | ".join(parts)

    @staticmethod
    def build_class_text(name: str, bases: List[str], docstring: Optional[str]) -> str:
        header = f"class {name}"
        if bases:
            header += f" extends {', '.join(bases)}"
        parts = [header]
        if docstring:
            parts.append(docstring)
        return " | ".join(parts)


embedding_service = EmbeddingService()
