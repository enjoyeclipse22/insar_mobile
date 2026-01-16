"""
WebSocket Server for Real-time Processing Updates
Handles real-time log streaming and progress updates to connected clients
"""

import logging
import asyncio
import json
from typing import Dict, Set, Optional
from datetime import datetime
from enum import Enum

try:
    from socketio import AsyncServer, ASGIApp
    from aiohttp import web
    SOCKETIO_AVAILABLE = True
except ImportError:
    SOCKETIO_AVAILABLE = False
    logging.warning("socket.io not available, WebSocket features disabled")

logger = logging.getLogger(__name__)


class EventType(str, Enum):
    """WebSocket event types"""
    CONNECT = "connect"
    DISCONNECT = "disconnect"
    TASK_STARTED = "task:started"
    TASK_PROGRESS = "task:progress"
    TASK_LOG = "task:log"
    TASK_ERROR = "task:error"
    TASK_COMPLETED = "task:completed"
    TASK_FAILED = "task:failed"
    HEARTBEAT = "heartbeat"


class WebSocketManager:
    """Manages WebSocket connections and message broadcasting"""

    def __init__(self):
        self.connected_clients: Dict[str, Set[str]] = {}  # task_id -> set of client_ids
        self.client_tasks: Dict[str, str] = {}  # client_id -> task_id
        self.sio: Optional[AsyncServer] = None
        self.app: Optional[ASGIApp] = None

    def initialize(self, sio: AsyncServer):
        """Initialize WebSocket manager with socket.io server"""
        self.sio = sio
        logger.info("WebSocket manager initialized")

    async def on_connect(self, sid: str, environ):
        """Handle client connection"""
        logger.info(f"Client connected: {sid}")
        await self.sio.emit("connection_response", {"data": "Connected"}, to=sid)

    async def on_disconnect(self, sid: str):
        """Handle client disconnection"""
        logger.info(f"Client disconnected: {sid}")

        # Clean up client's task subscription
        if sid in self.client_tasks:
            task_id = self.client_tasks[sid]
            if task_id in self.connected_clients:
                self.connected_clients[task_id].discard(sid)
                if not self.connected_clients[task_id]:
                    del self.connected_clients[task_id]
            del self.client_tasks[sid]

    async def on_subscribe_task(self, sid: str, data: dict):
        """Handle task subscription"""
        task_id = data.get("task_id")

        if not task_id:
            await self.sio.emit(
                "error",
                {"message": "task_id is required"},
                to=sid
            )
            return

        # Subscribe client to task
        if task_id not in self.connected_clients:
            self.connected_clients[task_id] = set()

        self.connected_clients[task_id].add(sid)
        self.client_tasks[sid] = task_id

        logger.info(f"Client {sid} subscribed to task {task_id}")

        await self.sio.emit(
            "subscribed",
            {"task_id": task_id, "message": f"Subscribed to task {task_id}"},
            to=sid
        )

    async def on_unsubscribe_task(self, sid: str, data: dict):
        """Handle task unsubscription"""
        task_id = data.get("task_id")

        if task_id and task_id in self.connected_clients:
            self.connected_clients[task_id].discard(sid)
            if not self.connected_clients[task_id]:
                del self.connected_clients[task_id]

        if sid in self.client_tasks:
            del self.client_tasks[sid]

        logger.info(f"Client {sid} unsubscribed from task {task_id}")

        await self.sio.emit(
            "unsubscribed",
            {"task_id": task_id},
            to=sid
        )

    async def broadcast_log(self, task_id: str, level: str, message: str):
        """Broadcast log message to all clients subscribed to a task"""
        if task_id not in self.connected_clients:
            return

        log_data = {
            "task_id": task_id,
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message
        }

        for client_id in self.connected_clients[task_id]:
            await self.sio.emit(
                EventType.TASK_LOG,
                log_data,
                to=client_id
            )

        logger.debug(f"Broadcast log to {len(self.connected_clients[task_id])} clients")

    async def broadcast_progress(self, task_id: str, progress: float, step: str, message: str):
        """Broadcast progress update to all clients subscribed to a task"""
        if task_id not in self.connected_clients:
            return

        progress_data = {
            "task_id": task_id,
            "timestamp": datetime.now().isoformat(),
            "progress": progress,
            "current_step": step,
            "message": message
        }

        for client_id in self.connected_clients[task_id]:
            await self.sio.emit(
                EventType.TASK_PROGRESS,
                progress_data,
                to=client_id
            )

        logger.debug(f"Broadcast progress to {len(self.connected_clients[task_id])} clients")

    async def broadcast_error(self, task_id: str, error: str):
        """Broadcast error to all clients subscribed to a task"""
        if task_id not in self.connected_clients:
            return

        error_data = {
            "task_id": task_id,
            "timestamp": datetime.now().isoformat(),
            "error": error
        }

        for client_id in self.connected_clients[task_id]:
            await self.sio.emit(
                EventType.TASK_ERROR,
                error_data,
                to=client_id
            )

        logger.debug(f"Broadcast error to {len(self.connected_clients[task_id])} clients")

    async def broadcast_completion(self, task_id: str, status: str, results: dict):
        """Broadcast task completion to all clients"""
        if task_id not in self.connected_clients:
            return

        completion_data = {
            "task_id": task_id,
            "timestamp": datetime.now().isoformat(),
            "status": status,
            "results": results
        }

        event_type = EventType.TASK_COMPLETED if status == "completed" else EventType.TASK_FAILED

        for client_id in self.connected_clients[task_id]:
            await self.sio.emit(
                event_type,
                completion_data,
                to=client_id
            )

        logger.info(f"Broadcast {status} to {len(self.connected_clients[task_id])} clients")

    def get_connected_clients_count(self, task_id: str) -> int:
        """Get number of connected clients for a task"""
        return len(self.connected_clients.get(task_id, set()))


# Global WebSocket manager instance
ws_manager = WebSocketManager()


async def create_websocket_server(app_instance):
    """Create and configure WebSocket server"""
    if not SOCKETIO_AVAILABLE:
        logger.warning("socket.io not available, skipping WebSocket server setup")
        return None

    try:
        # Create socket.io server
        sio = AsyncServer(
            async_mode="aiohttp",
            cors_allowed_origins="*",
            ping_timeout=60,
            ping_interval=25
        )

        # Initialize manager
        ws_manager.initialize(sio)

        # Register event handlers
        @sio.on(EventType.CONNECT)
        async def connect(sid, environ):
            await ws_manager.on_connect(sid, environ)

        @sio.on(EventType.DISCONNECT)
        async def disconnect(sid):
            await ws_manager.on_disconnect(sid)

        @sio.on("subscribe_task")
        async def subscribe_task(sid, data):
            await ws_manager.on_subscribe_task(sid, data)

        @sio.on("unsubscribe_task")
        async def unsubscribe_task(sid, data):
            await ws_manager.on_unsubscribe_task(sid, data)

        @sio.on(EventType.HEARTBEAT)
        async def heartbeat(sid):
            await sio.emit(EventType.HEARTBEAT, {"timestamp": datetime.now().isoformat()}, to=sid)

        logger.info("WebSocket server created successfully")
        return sio

    except Exception as e:
        logger.error(f"Failed to create WebSocket server: {str(e)}")
        return None


def get_ws_manager() -> WebSocketManager:
    """Get global WebSocket manager instance"""
    return ws_manager
