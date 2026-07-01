"""
Manages WebSocket connections and broadcasts repository processing
progress events to connected frontend clients in real time.
"""
import asyncio
import json
import logging
from typing import Dict, List, Optional

from fastapi import WebSocket

logger = logging.getLogger("helix.websocket_manager")


class WebSocketManager:
    def __init__(self) -> None:
        self._connections: Dict[str, List[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, client_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(client_id, []).append(websocket)
        logger.info("WebSocket connected: client_id=%s (total=%d)", client_id, len(self._connections[client_id]))

    def disconnect(self, client_id: str, websocket: WebSocket) -> None:
        conns = self._connections.get(client_id)
        if conns and websocket in conns:
            conns.remove(websocket)
            if not conns:
                self._connections.pop(client_id, None)
        logger.info("WebSocket disconnected: client_id=%s", client_id)

    async def send_progress(self, client_id: str, stage: str, progress: float, message: str, detail: Optional[dict] = None) -> None:
        payload = {"type": "progress", "stage": stage, "progress": round(progress, 1), "message": message, "detail": detail or {}}
        await self._send_to_client(client_id, payload)

    async def send_error(self, client_id: str, message: str) -> None:
        await self._send_to_client(client_id, {"type": "error", "message": message})

    async def _send_to_client(self, client_id: str, payload: dict) -> None:
        conns = self._connections.get(client_id, [])
        if not conns:
            return
        text = json.dumps(payload)
        stale: List[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(text)
            except Exception:
                logger.warning("Failed sending to a stale websocket for client_id=%s", client_id)
                stale.append(ws)
        for ws in stale:
            self.disconnect(client_id, ws)

    async def broadcast(self, payload: dict) -> None:
        for client_id in list(self._connections.keys()):
            await self._send_to_client(client_id, payload)


websocket_manager = WebSocketManager()
