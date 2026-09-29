from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..core.database import get_db
from ..core.security import get_current_user
from ..core.websocket_manager import manager
from ..models.room import Room, RoomMember, RoomType
from ..models.message import Message, MessageType, Notification
from ..models.user import User
from ..schemas.schemas import RoomCreate, RoomOut, DMCreate
import json

router = APIRouter(prefix="/api/rooms", tags=["rooms"])

def room_to_out(room: Room, user_id: int, db: Session) -> RoomOut:
    member_count = db.query(RoomMember).filter(RoomMember.room_id == room.id).count()
    member = db.query(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == user_id).first()
    unread = 0
    if member:
        unread = db.query(Message).filter(
            Message.room_id == room.id,
            Message.created_at > member.last_read_at,
            Message.sender_id != user_id
        ).count()
    last_msg = db.query(Message).filter(Message.room_id == room.id).order_by(Message.created_at.desc()).first()
    last_text = None
    if last_msg and not last_msg.is_deleted:
        last_text = last_msg.content if last_msg.content else "[file]"
    name = room.name
    if room.room_type == RoomType.DM:
        other = db.query(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id != user_id).first()
        if other:
            u = db.query(User).filter(User.id == other.user_id).first()
            name = u.display_name or u.username if u else room.name
    out = RoomOut.model_validate(room)
    out.member_count = member_count
    out.unread_count = unread
    out.last_message = last_text
    out.name = name
    return out

@router.get("/", response_model=List[RoomOut])
def get_my_rooms(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    memberships = db.query(RoomMember).filter(RoomMember.user_id == current_user.id).all()
    rooms = [db.query(Room).filter(Room.id == m.room_id).first() for m in memberships]
    return [room_to_out(r, current_user.id, db) for r in rooms if r]

@router.get("/public", response_model=List[RoomOut])
def get_public_rooms(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rooms = db.query(Room).filter(Room.room_type == RoomType.PUBLIC).all()
    return [room_to_out(r, current_user.id, db) for r in rooms]

@router.post("/", response_model=RoomOut)
def create_room(data: RoomCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    room = Room(name=data.name, description=data.description, room_type=data.room_type, created_by=current_user.id)
    db.add(room)
    db.commit()
    db.refresh(room)
    member = RoomMember(room_id=room.id, user_id=current_user.id, is_admin=True)
    db.add(member)
    sys_msg = Message(room_id=room.id, sender_id=current_user.id, content=f"{current_user.display_name or current_user.username} created this room.", message_type=MessageType.SYSTEM)
    db.add(sys_msg)
    db.commit()
    return room_to_out(room, current_user.id, db)

@router.post("/dm", response_model=RoomOut)
def create_dm(data: DMCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    target = db.query(User).filter(User.id == data.target_user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    my_rooms = {m.room_id for m in db.query(RoomMember).filter(RoomMember.user_id == current_user.id).all()}
    target_rooms = {m.room_id for m in db.query(RoomMember).filter(RoomMember.user_id == target.id).all()}
    shared = my_rooms & target_rooms
    for rid in shared:
        r = db.query(Room).filter(Room.id == rid, Room.room_type == RoomType.DM).first()
        if r:
            return room_to_out(r, current_user.id, db)
    room = Room(name=None, room_type=RoomType.DM, created_by=current_user.id)
    db.add(room)
    db.commit()
    db.refresh(room)
    db.add(RoomMember(room_id=room.id, user_id=current_user.id))
    db.add(RoomMember(room_id=room.id, user_id=target.id))
    db.commit()
    return room_to_out(room, current_user.id, db)

@router.post("/{room_id}/join")
def join_room(room_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(404, "Room not found")
    if room.room_type != RoomType.PUBLIC:
        raise HTTPException(403, "Cannot join private room directly")
    exists = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id).first()
    if not exists:
        db.add(RoomMember(room_id=room_id, user_id=current_user.id))
        sys_msg = Message(room_id=room_id, sender_id=current_user.id, content=f"{current_user.display_name or current_user.username} joined the room.", message_type=MessageType.SYSTEM)
        db.add(sys_msg)
        db.commit()
    return {"message": "Joined"}

@router.post("/{room_id}/read")
def mark_read(room_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from datetime import datetime
    member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id).first()
    if member:
        member.last_read_at = datetime.utcnow()
        db.commit()
    return {"message": "Marked as read"}

@router.get("/{room_id}/members")
def get_members(room_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    members = db.query(RoomMember).filter(RoomMember.room_id == room_id).all()
    online_ids = manager.get_online_user_ids()
    result = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        if u:
            result.append({"id": u.id, "username": u.username, "display_name": u.display_name, "avatar_url": u.avatar_url, "is_online": u.id in online_ids, "is_admin": m.is_admin})
    return result

@router.delete("/{room_id}")
async def delete_room(room_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from ..models.workspace import WorkspaceMember, WorkspaceRoom
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(404, "Room not found")
    if room.room_type != RoomType.PUBLIC:
        raise HTTPException(403, "Use group delete for private rooms")
    # find WorkspaceRoom by name match and check admin
    ws_room = db.query(WorkspaceRoom).filter(WorkspaceRoom.name == room.name).first()
    if ws_room:
        member = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == ws_room.workspace_id,
            WorkspaceMember.user_id == current_user.id
        ).first()
        if not member or member.role not in ("owner", "admin"):
            raise HTTPException(403, "Only admins can delete channels")
        db.delete(ws_room)
    db.query(Message).filter(Message.room_id == room_id).delete()
    db.query(RoomMember).filter(RoomMember.room_id == room_id).delete()
    db.delete(room)
    db.commit()
    return {"message": "Channel deleted"}