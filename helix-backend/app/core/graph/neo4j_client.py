"""
Async Neo4j client with connection pooling and convenience helpers
for read/write transactions used throughout the graph layer.
"""
import logging
from typing import Any, Dict, List, Optional, Tuple

from neo4j import AsyncDriver, AsyncGraphDatabase, AsyncSession
from neo4j.exceptions import Neo4jError, ServiceUnavailable

from app.config import settings

logger = logging.getLogger("helix.neo4j")


class Neo4jClient:
    """Singleton-style async wrapper around the Neo4j driver."""

    def __init__(self) -> None:
        self._driver: Optional[AsyncDriver] = None

    async def connect(self) -> None:
        if self._driver is not None:
            return
        self._driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            max_connection_pool_size=settings.NEO4J_MAX_CONNECTION_POOL_SIZE,
            connection_timeout=settings.NEO4J_CONNECTION_TIMEOUT,
            keep_alive=True,
        )
        await self.verify_connectivity(raise_on_error=True)

    async def close(self) -> None:
        if self._driver is not None:
            await self._driver.close()
            self._driver = None

    @property
    def driver(self) -> AsyncDriver:
        if self._driver is None:
            raise RuntimeError("Neo4j driver is not initialized. Call connect() first.")
        return self._driver

    async def verify_connectivity(self, raise_on_error: bool = False) -> bool:
        try:
            await self.driver.verify_connectivity()
            return True
        except Exception as exc:
            logger.error("Neo4j connectivity check failed: %s", exc)
            if raise_on_error:
                raise
            return False

    def session(self, database: Optional[str] = None) -> AsyncSession:
        return self.driver.session(database=database or settings.NEO4J_DATABASE)

    async def execute_read(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None,
        database: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        parameters = parameters or {}
        async with self.session(database) as session:
            try:
                return await session.execute_read(self._run_and_collect, query, parameters)
            except Neo4jError:
                logger.exception("Neo4j read query failed: %s", query)
                raise
            except ServiceUnavailable:
                logger.exception("Neo4j service unavailable during read.")
                raise

    async def execute_write(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None,
        database: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        parameters = parameters or {}
        async with self.session(database) as session:
            try:
                return await session.execute_write(self._run_and_collect, query, parameters)
            except Neo4jError:
                logger.exception("Neo4j write query failed: %s", query)
                raise
            except ServiceUnavailable:
                logger.exception("Neo4j service unavailable during write.")
                raise

    async def execute_write_batch(
        self,
        statements: List[Tuple[str, Dict[str, Any]]],
        database: Optional[str] = None,
    ) -> None:
        """Run multiple write statements inside a single transaction."""

        async def _tx_fn(tx):
            for query, params in statements:
                await tx.run(query, params)

        async with self.session(database) as session:
            await session.execute_write(_tx_fn)

    @staticmethod
    async def _run_and_collect(tx, query: str, parameters: Dict[str, Any]) -> List[Dict[str, Any]]:
        result = await tx.run(query, parameters)
        return await result.data()

    async def ensure_constraints(self) -> None:
        """Create uniqueness constraints used by the graph schema (idempotent)."""
        statements = [
            "CREATE CONSTRAINT file_path_unique IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE",
            "CREATE CONSTRAINT function_id_unique IF NOT EXISTS FOR (fn:Function) REQUIRE fn.id IS UNIQUE",
            "CREATE CONSTRAINT class_id_unique IF NOT EXISTS FOR (c:Class) REQUIRE c.id IS UNIQUE",
            "CREATE CONSTRAINT module_name_unique IF NOT EXISTS FOR (m:Module) REQUIRE m.name IS UNIQUE",
        ]
        for stmt in statements:
            try:
                await self.execute_write(stmt)
            except Neo4jError:
                logger.exception("Failed creating constraint: %s", stmt)


neo4j_client = Neo4jClient()
