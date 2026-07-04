"""
Phase 14 — Enhanced WebSocket Manager

Upgrades the original broadcaster with:
  - Per-repository rooms  — clients subscribe to a specific repo_id
  - Message types         — progress, analysis_complete, error, node_added
  - Client subscriptions  — client sends {"subscribe": "repo_id"}
  - Heartbeat             — ping/pong every 30 seconds
  - Reconnect state       — last 50 events per repo stored in Redis;
                            replayed on reconnect so clients catch up
"""
import asyncio
import json
import logging
import time
from typing import Dict, List, Optional, Set

import redis.asyncio as aioredis
from fastapi import WebSocket

from app.config import settings

logger = logging.getLogger("helix.websocket_manager")

HEARTBEAT_INTERVAL = 30
MAX_STORED_EVENTS = 50
EVENT_TTL = 3600


class WebSocketManager:
    def __init__(self) -> None:
        self._rooms: Dict[str, Set[WebSocket]] = {}
        self._subscriptions: Dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()
        self._redis: Optional[aioredis.Redis] = None
        self._heartbeat_task: Optional[asyncio.Task] = None

    def start_heartbeat(self) -> None:
        if self._heartbeat_task is None or self._heartbeat_task.done():
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    def stop_heartbeat(self) -> None:
        if self._heartbeat_task:
            self._heartbeat_task.cancel()

    def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        return self._redis

    async def connect(self, client_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._rooms.setdefault(client_id, set()).add(websocket)
            self._subscriptions[websocket] = client_id
        await self._replay_events(client_id, websocket)
        logger.info("WS connected: room=%s", client_id)

    def disconnect(self, websocket: WebSocket) -> None:
        repo_id = self._subscriptions.pop(websocket, None)
        if repo_id and repo_id in self._rooms:
            self._rooms[repo_id].discard(websocket)
            if not self._rooms[repo_id]:
                del self._rooms[repo_id]
        logger.info("WS disconnected from room %s", repo_id)

    # kept for backwards compat with old disconnect(client_id, ws) calls
    def disconnect_by_id(self, client_id: str, websocket: WebSocket) -> None:
        self.disconnect(websocket)

    async def handle_client_message(self, websocket: WebSocket, raw: str) -> None:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return
        if "subscribe" in data:
            new_repo_id = data["subscribe"]
            await self._resubscribe(websocket, new_repo_id)
            await self._replay_events(new_repo_id, websocket)

    async def _resubscribe(self, websocket: WebSocket, new_repo_id: str) -> None:
        async with self._lock:
            old_id = self._subscriptions.get(websocket)
            if old_id and old_id in self._rooms:
                self._rooms[old_id].discard(websocket)
                if not self._rooms[old_id]:
                    del self._rooms[old_id]
            self._rooms.setdefault(new_repo_id, set()).add(websocket)
            self._subscriptions[websocket] = new_repo_id

    # ------------------------------------------------------------------
    # Public send helpers
    # ------------------------------------------------------------------

    async def send_progress(self, repo_id: str, stage: str, progress: float,
                             message: str, detail: Optional[dict] = None) -> None:
        await self._broadcast(repo_id, {
            "type": "progress", "stage": stage,
            "progress": round(progress, 1), "message": message,
            "detail": detail or {}, "ts": time.time(),
        })

    async def send_analysis_complete(self, repo_id: str, analysis_type: str, summary: dict) -> None:
        await self._broadcast(repo_id, {
            "type": "analysis_complete", "analysis_type": analysis_type,
            "summary": summary, "ts": time.time(),
        })

    async def send_error(self, repo_id: str, message: str) -> None:
        await self._broadcast(repo_id, {
            "type": "error", "message": message, "ts": time.time(),
        })

    async def send_node_added(self, repo_id: str, node_type: str,
                               node_id: str, name: str) -> None:
        await self._broadcast(repo_id, {
            "type": "node_added", "node_type": node_type,
            "node_id": node_id, "name": name, "ts": time.time(),
        })

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _broadcast(self, repo_id: str, payload: dict) -> None:
        text = json.dumps(payload)
        await self._store_event(repo_id, text)
        stale: List[WebSocket] = []
        for ws in list(self._rooms.get(repo_id, set())):
            try:
                await ws.send_text(text)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws)

    async def _store_event(self, repo_id: str, text: str) -> None:
        try:
            r = self._get_redis()
            key = f"helix:ws_events:{repo_id}"
            await r.lpush(key, text)
            await r.ltrim(key, 0, MAX_STORED_EVENTS - 1)
            await r.expire(key, EVENT_TTL)
        except Exception:
            pass

    async def _replay_events(self, repo_id: str, websocket: WebSocket) -> None:
        try:
            r = self._get_redis()
            key = f"helix:ws_events:{repo_id}"
            events = await r.lrange(key, 0, MAX_STORED_EVENTS - 1)
            for event in reversed(events):
                try:
                    await websocket.send_text(event)
                except Exception:
                    break
        except Exception:
            pass

    async def _heartbeat_loop(self) -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            payload = json.dumps({"type": "ping", "ts": time.time()})
            for repo_id in list(self._rooms.keys()):
                stale = []
                for ws in list(self._rooms.get(repo_id, set())):
                    try:
                        await ws.send_text(payload)
                    except Exception:
                        stale.append(ws)
                for ws in stale:
                    self.disconnect(ws)


websocket_manager = WebSocketManager()
