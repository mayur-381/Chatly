from fastapi import WebSocket
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}
        self.user_rooms: Dict[int, set] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_to_user(self, user_id: int, data: dict):
        if user_id in self.active_connections:
            msg = json.dumps(data)
            for ws in self.active_connections[user_id]:
                try:
                    await ws.send_text(msg)
                except Exception:
                    pass

    async def broadcast_to_room(self, room_member_ids: list, data: dict, exclude_user: int = None):
        msg = json.dumps(data)
        for uid in room_member_ids:
            if uid == exclude_user:
                continue
            if uid in self.active_connections:
                for ws in self.active_connections[uid]:
                    try:
                        await ws.send_text(msg)
                    except Exception:
                        pass

    def is_online(self, user_id: int) -> bool:
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0

    def get_online_user_ids(self) -> list:
        return list(self.active_connections.keys())

manager = ConnectionManager()
