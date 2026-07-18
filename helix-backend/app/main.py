"""
Helix backend - FastAPI application entrypoint v0.3.1
"""
import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import ai, analysis, auth, comparison, docs, git, graph, repository, search
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
    logger.info("Starting %s backend v0.3.1 ...", settings.APP_NAME)
    try:
        await asyncio.wait_for(neo4j_client.connect(), timeout=5.0)
        logger.info("Neo4j connection established.")
    except asyncio.TimeoutError:
        logger.warning("Neo4j connection timed out on startup — will retry on first request.")
    except Exception:
        logger.exception("Failed to connect to Neo4j on startup. The API will still boot.")
    try:
        await init_db()
        logger.info("PostgreSQL schema ready.")
    except Exception:
        logger.exception("Failed to initialize PostgreSQL on startup.")

    websocket_manager.start_heartbeat()
    yield
    websocket_manager.stop_heartbeat()
    await neo4j_client.close()
    await close_db()


app = FastAPI(
    title=settings.APP_NAME,
    description="AI Code Intelligence Platform — Phases 1-15",
    version="0.3.1",
    debug=settings.APP_DEBUG,
    lifespan=lifespan,
)

# ── Middleware (order matters: last added = first to run) ──────────────────
# Add timing FIRST so it runs LAST (after CORS)
@app.middleware("http")
async def add_start_time(request: Request, call_next):
    request.state.start_time = time.time()
    return await call_next(request)

# Add CORS LAST so it runs FIRST (handles preflight before anything else)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────
app.include_router(auth.router,        prefix="/api/v1/auth",         tags=["auth"])
app.include_router(repository.router,  prefix="/api/v1/repositories", tags=["repositories"])
app.include_router(git.router,         prefix="/api/v1/repositories", tags=["git"])
app.include_router(graph.router,       prefix="/api/v1/graph",        tags=["graph"])
app.include_router(ai.router,          prefix="/api/v1/ai",           tags=["ai"])
app.include_router(search.router,      prefix="/api/v1/search",       tags=["search"])
app.include_router(analysis.router,    prefix="/api/v1/analysis",     tags=["analysis"])
app.include_router(docs.router,        prefix="/api/v1/docs",         tags=["docs"])
app.include_router(comparison.router,  prefix="/api/v1/comparison",   tags=["comparison"])


@app.get("/", tags=["health"])
async def root():
    return {"service": settings.APP_NAME, "status": "ok", "version": "0.3.1"}


@app.get("/health", tags=["health"])
async def health_check():
    neo4j_ok = await neo4j_client.verify_connectivity()
    return {"status": "ok" if neo4j_ok else "degraded", "neo4j": neo4j_ok}


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket_manager.connect(client_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket_manager.handle_client_message(websocket, data)
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket)
    except Exception:
        logger.exception("WS error for client_id=%s", client_id)
        websocket_manager.disconnect(websocket)