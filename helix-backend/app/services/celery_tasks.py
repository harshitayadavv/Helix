"""
Celery application and background tasks for long-running repository
ingestion work, kept separate from the FastAPI request/response cycle.
"""
import asyncio
import logging

from celery import Celery
from sqlalchemy import select

from app.config import settings
from app.core.graph.neo4j_client import neo4j_client
from app.db.postgres import AsyncSessionLocal, RepositoryModel, engine
from app.models.repository import RepoStatus
from app.services.repo_processor import RepoProcessor
from app.services.websocket_manager import websocket_manager

logger = logging.getLogger("helix.celery")

celery_app = Celery("helix", broker=settings.CELERY_BROKER_URL, backend=settings.CELERY_RESULT_BACKEND)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)


async def _update_repo_status(repo_id: str, status: RepoStatus, **fields) -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(RepositoryModel).where(RepositoryModel.id == repo_id))
        repo = result.scalar_one_or_none()
        if repo is None:
            logger.warning("Repository %s not found while updating status.", repo_id)
            return
        repo.status = status.value
        for key, value in fields.items():
            setattr(repo, key, value)
        await session.commit()


async def _run_pipeline(repo_id: str, zip_path: str) -> None:
    processor = RepoProcessor(repo_id)
    try:
        # The Celery worker is a separate process from the FastAPI app and
        # never runs main.py's lifespan startup, so the Neo4j driver is
        # never connected unless we do it here. connect() is idempotent
        # (it no-ops if already connected), so this is safe to call on
        # every task without overhead after the first call.
        await neo4j_client.connect()

        await _update_repo_status(repo_id, RepoStatus.EXTRACTING)
        parsed_files = await processor.process_zip_upload(zip_path)

        function_count = sum(len(pf.functions) + sum(len(c.methods) for c in pf.classes) for pf in parsed_files)
        class_count = sum(len(pf.classes) for pf in parsed_files)

        await _update_repo_status(
            repo_id, RepoStatus.COMPLETED, file_count=len(parsed_files), function_count=function_count, class_count=class_count
        )
    except Exception as exc:
        logger.exception("Pipeline failed for repository %s", repo_id)
        await _update_repo_status(repo_id, RepoStatus.FAILED, error_message=str(exc))
        await websocket_manager.send_error(repo_id, str(exc))
        raise
    finally:
        # Each Celery task call gets its own asyncio.run() and therefore
        # its own event loop. The SQLAlchemy async engine's connection
        # pool, however, is a single global created at import time, so
        # pooled connections can end up bound to a now-closed event loop
        # by the time the next task runs. Disposing the pool here forces
        # fresh connections on the next call instead of reusing stale
        # ones, which otherwise surfaces as "Event loop is closed" /
        # "'NoneType' object has no attribute 'send'" (most visible on
        # Windows with the default ProactorEventLoop).
        await engine.dispose()


@celery_app.task(name="helix.process_repository", bind=True, max_retries=2, default_retry_delay=30)
def process_repository_task(self, repo_id: str, zip_path: str) -> str:
    """Celery entrypoint: runs the async ingestion pipeline to completion."""
    try:
        asyncio.run(_run_pipeline(repo_id, zip_path))
        return f"Repository {repo_id} processed successfully."
    except Exception as exc:
        logger.exception("Celery task failed for repo %s", repo_id)
        raise self.retry(exc=exc)