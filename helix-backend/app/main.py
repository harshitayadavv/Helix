"""
Helix backend - FastAPI application entrypoint.

Wires together: CORS, lifespan startup/shutdown (Neo4j + PostgreSQL),
the REST API routers, and a WebSocket endpoint used to stream
repository-processing progress to the frontend in real time.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import ai, graph, repository, search
from app.config import settings
from app.core.graph.neo4j_client import neo4j_client
from app.db.postgres import close_db, init_db
from app.services.websocket_manager import websocket_manager

logging.basicConfig(
    level=logging.DEBUG if settings.APP_DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("helix.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s backend...", settings.APP_NAME)

    try:
        await neo4j_client.connect()
        logger.info("Neo4j connection established.")
    except Exception:
        logger.exception("Failed to connect to Neo4j on startup. The API will still boot.")

    try:
        await init_db()
        logger.info("PostgreSQL schema ready.")
    except Exception:
        logger.exception("Failed to initialize PostgreSQL on startup. The API will still boot.")

    yield

    logger.info("Shutting down %s backend...", settings.APP_NAME)
    await neo4j_client.close()
    await close_db()


app = FastAPI(
    title=settings.APP_NAME,
    description="AI Code Intelligence Platform - backend services",
    version="0.1.0",
    debug=settings.APP_DEBUG,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(repository.router, prefix="/api/v1/repositories", tags=["repositories"])
app.include_router(graph.router, prefix="/api/v1/graph", tags=["graph"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(search.router, prefix="/api/v1/search", tags=["search"])


@app.get("/", tags=["health"])
async def root():
    return {"service": settings.APP_NAME, "status": "ok"}


@app.get("/health", tags=["health"])
async def health_check():
    neo4j_ok = await neo4j_client.verify_connectivity()
    return {
        "status": "ok" if neo4j_ok else "degraded",
        "neo4j": neo4j_ok,
    }


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """
    Real-time channel for repository processing progress updates.

    The frontend connects using a client_id that matches the repo_id
    returned from the upload endpoint, then receives JSON progress /
    error events as the ingestion pipeline runs.
    """
    await websocket_manager.connect(client_id, websocket)
    try:
        while True:
            # We only push server -> client, but keep reading so we
            # detect disconnects (and tolerate client-side pings).
            await websocket.receive_text()
    except WebSocketDisconnect:
        websocket_manager.disconnect(client_id, websocket)
    except Exception:
        logger.exception("Unexpected error on websocket for client_id=%s", client_id)
        websocket_manager.disconnect(client_id, websocket)
