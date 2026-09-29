from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os, uuid, aiofiles
from ..core.database import get_db
from ..core.security import get_current_user
from ..core.config import settings
from ..core.websocket_manager import manager
from ..models.message import Message, MessageType, Notification
from ..models.room import Room, RoomMember
from ..models.user import User
from ..schemas.schemas import MessageOut, UserOut
import json

router = APIRouter(prefix="/api/messages", tags=["messages"])

def build_msg_out(msg: Message, db: Session) -> dict:
    sender = db.query(User).filter(User.id == msg.sender_id).first()
    sender_out = UserOut.model_validate(sender) if sender else None
    out = MessageOut.model_validate(msg)
    out.sender = sender_out
    return json.loads(out.model_dump_json())

def get_room_member_ids(room_id: int, db: Session) -> list:
    return [m.user_id for m in db.query(RoomMember).filter(RoomMember.room_id == room_id).all()]

@router.get("/{room_id}", response_model=List[MessageOut])
def get_messages(room_id: int, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id).first()
    if not member:
        raise HTTPException(403, "Not a member of this room")
    msgs = db.query(Message).filter(Message.room_id == room_id).order_by(Message.created_at.desc()).offset(skip).limit(limit).all()
    msgs.reverse()
    result = []
    for msg in msgs:
        sender = db.query(User).filter(User.id == msg.sender_id).first()
        out = MessageOut.model_validate(msg)
        out.sender = UserOut.model_validate(sender) if sender else None
        result.append(out)
    return result

@router.post("/{room_id}/send")
async def send_message(
    room_id: int,
    content: Optional[str] = Form(None),
    reply_to_id: Optional[int] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id).first()
    if not member:
        raise HTTPException(403, "Not a member of this room")

    msg_type = MessageType.TEXT
    file_url = file_name = None
    file_size = None

    if file:
        ext = os.path.splitext(file.filename)[1].lower()
        img_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
        msg_type = MessageType.IMAGE if ext in img_exts else MessageType.FILE
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        unique_name = f"{uuid.uuid4()}{ext}"
        file_path = os.path.join(settings.UPLOAD_DIR, unique_name)
        async with aiofiles.open(file_path, "wb") as f:
            contents = await file.read()
            if len(contents) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
                raise HTTPException(413, f"File too large. Max {settings.MAX_FILE_SIZE_MB}MB")
            await f.write(contents)
        file_url = f"/uploads/{unique_name}"
        file_name = file.filename
        file_size = len(contents)

    msg = Message(
        room_id=room_id, sender_id=current_user.id,
        content=content, message_type=msg_type,
        file_url=file_url, file_name=file_name, file_size=file_size,
        reply_to_id=reply_to_id
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    member_ids = get_room_member_ids(room_id, db)
    msg_data = build_msg_out(msg, db)

    await manager.broadcast_to_room(member_ids, {
        "type": "new_message",
        "payload": msg_data
    })

    for uid in member_ids:
        if uid != current_user.id:
            notif = Notification(
                user_id=uid, room_id=room_id, message_id=msg.id,
                content=f"{current_user.display_name or current_user.username}: {content or '[file]'}"
            )
            db.add(notif)
            await manager.send_to_user(uid, {
                "type": "notification",
                "payload": {"room_id": room_id, "content": notif.content}
            })
    db.commit()
    return msg_data

@router.delete("/{message_id}")
async def delete_message(message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(403, "Cannot delete others' messages")
    msg.is_deleted = True
    msg.content = "This message was deleted"
    db.commit()
    member_ids = get_room_member_ids(msg.room_id, db)
    await manager.broadcast_to_room(member_ids, {"type": "message_deleted", "payload": {"message_id": message_id, "room_id": msg.room_id}})
    return {"message": "Deleted"}

@router.get("/notifications/all")
def get_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notifs = db.query(Notification).filter(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).limit(30).all()
    return notifs

@router.post("/notifications/read-all")
def mark_notifications_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"message": "All read"}
