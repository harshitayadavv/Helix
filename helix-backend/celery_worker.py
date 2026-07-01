"""
Celery worker entrypoint.

Run with:
    celery -A celery_worker.celery_app worker --loglevel=info
"""
from app.services.celery_tasks import celery_app

__all__ = ["celery_app"]
