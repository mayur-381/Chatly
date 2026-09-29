from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from ..core.websocket_manager import manager
from ..core.security import decode_token
from ..core.database import SessionLocal
from ..models.user import User
from datetime import datetime
import json

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub"))
    except Exception:
        await websocket.close(code=4001)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            await websocket.close(code=4001)
            return

        await manager.connect(websocket, user_id)
        online_ids = manager.get_online_user_ids()

        await manager.send_to_user(user_id, {
            "type": "connected",
            "payload": {"user_id": user_id, "online_users": online_ids}
        })

        await manager.broadcast_to_room(online_ids, {
            "type": "user_online",
            "payload": {"user_id": user_id}
        }, exclude_user=user_id)

        try:
            while True:
                data = await websocket.receive_text()
                msg = json.loads(data)

                if msg.get("type") == "typing":
                    room_id = msg.get("room_id")
                    from ..models.room import RoomMember
                    member_ids = [m.user_id for m in db.query(RoomMember).filter(RoomMember.room_id == room_id).all()]
                    await manager.broadcast_to_room(member_ids, {
                        "type": "typing",
                        "payload": {"user_id": user_id, "room_id": room_id, "username": user.display_name or user.username}
                    }, exclude_user=user_id)

                elif msg.get("type") == "ping":
                    await manager.send_to_user(user_id, {"type": "pong"})

        except WebSocketDisconnect:
            pass

    finally:
        manager.disconnect(websocket, user_id)
        user.last_seen = datetime.utcnow()
        db.commit()
        db.close()
        still_online = manager.get_online_user_ids()
        await manager.broadcast_to_room(still_online, {
            "type": "user_offline",
            "payload": {"user_id": user_id}
        })
