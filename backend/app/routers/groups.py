from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from ..core.database import get_db
from ..core.security import get_current_user
from ..core.websocket_manager import manager
from ..models.room import Room, RoomMember, RoomType
from ..models.workspace import WorkspaceMember, WorkspaceRole, Workspace
from ..models.message import Message, MessageType
from ..models.user import User
from ..schemas.schemas import RoomOut, UserOut
import json

router = APIRouter(prefix="/api/groups", tags=["groups"])

class GroupCreate(BaseModel):
    name: str
    description: str = ""
    workspace_id: int
    member_ids: List[int] = []

class GroupAddMembers(BaseModel):
    user_ids: List[int]

def require_ws_admin(workspace_id: int, user_id: int, db: Session):
    m = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id
    ).first()
    if not m or m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(403, "Only workspace owner or admin can manage groups")
    return m

def room_to_out(room: Room, user_id: int, db: Session) -> dict:
    members = db.query(RoomMember).filter(RoomMember.room_id == room.id).all()
    last_msg = db.query(Message).filter(Message.room_id == room.id, Message.is_deleted == False).order_by(Message.created_at.desc()).first()
    member = db.query(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == user_id).first()
    unread = 0
    if member:
        from sqlalchemy import func
        unread = db.query(Message).filter(
            Message.room_id == room.id,
            Message.created_at > member.last_read_at,
            Message.sender_id != user_id
        ).count()
    return {
        "id": room.id,
        "name": room.name,
        "description": room.description,
        "room_type": room.room_type,
        "created_by": room.created_by,
        "avatar_url": room.avatar_url,
        "created_at": room.created_at.isoformat(),
        "member_count": len(members),
        "unread_count": unread,
        "last_message": last_msg.content if last_msg and last_msg.message_type == MessageType.TEXT else ("[file]" if last_msg else None),
    }

@router.post("/")
async def create_group(
    data: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    require_ws_admin(data.workspace_id, current_user.id, db)

    # Verify all member_ids are in the workspace
    ws_member_ids = {m.user_id for m in db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == data.workspace_id).all()}
    invalid = [uid for uid in data.member_ids if uid not in ws_member_ids]
    if invalid:
        raise HTTPException(400, f"Some users are not in this workspace")

    room = Room(
        name=data.name,
        description=data.description,
        room_type=RoomType.PRIVATE,
        created_by=current_user.id
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    # Add creator as admin
    db.add(RoomMember(room_id=room.id, user_id=current_user.id, is_admin=True))

    # Add selected members
    added_ids = {current_user.id}
    for uid in data.member_ids:
        if uid not in added_ids:
            db.add(RoomMember(room_id=room.id, user_id=uid))
            added_ids.add(uid)

    # System message
    ws = db.query(Workspace).filter(Workspace.id == data.workspace_id).first()
    db.add(Message(
        room_id=room.id,
        sender_id=current_user.id,
        content=f"Group '{data.name}' created by {current_user.display_name or current_user.username}.",
        message_type=MessageType.SYSTEM
    ))
    db.commit()

    # Notify all added members via WebSocket
    for uid in added_ids:
        await manager.send_to_user(uid, {
            "type": "added_to_group",
            "payload": {
                "room_id": room.id,
                "room_name": room.name,
                "added_by": current_user.display_name or current_user.username
            }
        })

    return room_to_out(room, current_user.id, db)

@router.get("/workspace/{workspace_id}")
def get_workspace_groups(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Get all private rooms the user is a member of
    my_room_ids = {m.room_id for m in db.query(RoomMember).filter(RoomMember.user_id == current_user.id).all()}
    # Get all private rooms created by workspace members
    ws_member_ids = {m.user_id for m in db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id).all()}

    # Check if user is admin to see all groups
    me = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == current_user.id).first()
    is_admin = me and me.role in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN)

    rooms = db.query(Room).filter(Room.room_type == RoomType.PRIVATE).all()
    result = []
    for r in rooms:
        if r.created_by not in ws_member_ids:
            continue
        if is_admin or r.id in my_room_ids:
            result.append(room_to_out(r, current_user.id, db))
    return result

@router.get("/{room_id}/members")
def get_group_members(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    membership = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(403, "Not a member of this group")
    members = db.query(RoomMember).filter(RoomMember.room_id == room_id).all()
    online_ids = manager.get_online_user_ids()
    result = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        if u:
            result.append({
                "user_id": u.id,
                "username": u.username,
                "display_name": u.display_name,
                "avatar_url": u.avatar_url,
                "is_admin": m.is_admin,
                "is_online": u.id in online_ids
            })
    return result

@router.post("/{room_id}/members")
async def add_members_to_group(
    room_id: int,
    data: GroupAddMembers,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = db.query(Room).filter(Room.id == room_id, Room.room_type == RoomType.PRIVATE).first()
    if not room:
        raise HTTPException(404, "Group not found")

    # Must be room admin or workspace admin
    room_member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id, RoomMember.is_admin == True).first()
    if not room_member:
        raise HTTPException(403, "Only group admin can add members")

    added = []
    for uid in data.user_ids:
        existing = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == uid).first()
        if not existing:
            db.add(RoomMember(room_id=room_id, user_id=uid))
            u = db.query(User).filter(User.id == uid).first()
            if u:
                added.append(u.display_name or u.username)
            await manager.send_to_user(uid, {
                "type": "added_to_group",
                "payload": {"room_id": room_id, "room_name": room.name, "added_by": current_user.display_name or current_user.username}
            })

    if added:
        db.add(Message(room_id=room_id, sender_id=current_user.id, content=f"{', '.join(added)} added to the group.", message_type=MessageType.SYSTEM))
    db.commit()

    all_members = [m.user_id for m in db.query(RoomMember).filter(RoomMember.room_id == room_id).all()]
    await manager.broadcast_to_room(all_members, {"type": "group_members_updated", "payload": {"room_id": room_id}})
    return {"added": added}

@router.delete("/{room_id}/members/{user_id}")
async def remove_member_from_group(
    room_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = db.query(Room).filter(Room.id == room_id, Room.room_type == RoomType.PRIVATE).first()
    if not room:
        raise HTTPException(404, "Group not found")

    room_member = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == current_user.id, RoomMember.is_admin == True).first()
    if not room_member and user_id != current_user.id:
        raise HTTPException(403, "Only group admin can remove members")

    target = db.query(RoomMember).filter(RoomMember.room_id == room_id, RoomMember.user_id == user_id).first()
    if target:
        db.delete(target)
        u = db.query(User).filter(User.id == user_id).first()
        name = u.display_name or u.username if u else "Someone"
        db.add(Message(room_id=room_id, sender_id=current_user.id, content=f"{name} was removed from the group.", message_type=MessageType.SYSTEM))
        db.commit()
        await manager.send_to_user(user_id, {"type": "removed_from_group", "payload": {"room_id": room_id, "room_name": room.name}})
        remaining = [m.user_id for m in db.query(RoomMember).filter(RoomMember.room_id == room_id).all()]
        await manager.broadcast_to_room(remaining, {"type": "group_members_updated", "payload": {"room_id": room_id}})
    return {"message": "Removed"}

@router.delete("/{room_id}")
async def delete_group(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = db.query(Room).filter(Room.id == room_id, Room.room_type == RoomType.PRIVATE).first()
    if not room:
        raise HTTPException(404, "Group not found")
    if room.created_by != current_user.id:
        raise HTTPException(403, "Only the group creator can delete it")
    member_ids = [m.user_id for m in db.query(RoomMember).filter(RoomMember.room_id == room_id).all()]
    db.delete(room)
    db.commit()
    await manager.broadcast_to_room(member_ids, {"type": "group_deleted", "payload": {"room_id": room_id, "room_name": room.name}})
    return {"message": "Group deleted"}
