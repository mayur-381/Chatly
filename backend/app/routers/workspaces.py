from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..core.database import get_db
from ..core.security import get_current_user
from ..core.websocket_manager import manager
from ..models.workspace import Workspace, WorkspaceMember, WorkspaceRoom, WorkspaceRole, PinnedMessage
from ..models.message import Message, MessageType
from ..models.room import Room, RoomMember, RoomType
from ..models.user import User
from ..schemas.workspace_schemas import (
    WorkspaceCreate, WorkspaceOut, WorkspaceMemberOut,
    WorkspaceRoomCreate, WorkspaceRoomOut, RoleUpdate, MuteUpdate
)
import json

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

# ── helpers ──────────────────────────────────────────────────────────────────

def get_my_membership(workspace_id: int, user_id: int, db: Session) -> WorkspaceMember:
    m = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id
    ).first()
    if not m:
        raise HTTPException(403, "Not a member of this workspace")
    return m

def require_admin(workspace_id: int, user_id: int, db: Session) -> WorkspaceMember:
    m = get_my_membership(workspace_id, user_id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(403, "Admin or owner required")
    return m

def require_owner(workspace_id: int, user_id: int, db: Session) -> WorkspaceMember:
    m = get_my_membership(workspace_id, user_id, db)
    if m.role != WorkspaceRole.OWNER:
        raise HTTPException(403, "Owner only")
    return m

def ws_out(ws: Workspace, user_id: int, db: Session) -> WorkspaceOut:
    count = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == ws.id).count()
    me = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == ws.id, WorkspaceMember.user_id == user_id).first()
    out = WorkspaceOut.model_validate(ws)
    out.member_count = count
    out.my_role = me.role if me else WorkspaceRole.MEMBER
    return out

# ── workspace CRUD ────────────────────────────────────────────────────────────

@router.post("/", response_model=WorkspaceOut)
def create_workspace(data: WorkspaceCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ws = Workspace(name=data.name, description=data.description, icon=data.icon or "💬", owner_id=current_user.id)
    db.add(ws)
    db.commit()
    db.refresh(ws)
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role=WorkspaceRole.OWNER))
    # create a default #general room
    room = Room(name="general", description="General discussion", room_type=RoomType.PUBLIC, created_by=current_user.id)
    db.add(room)
    db.commit()
    db.refresh(room)
    db.add(WorkspaceRoom(workspace_id=ws.id, name="general", description="General discussion", created_by=current_user.id))
    db.add(RoomMember(room_id=room.id, user_id=current_user.id, is_admin=True))
    db.add(Message(room_id=room.id, sender_id=current_user.id, content=f"Welcome to {ws.name}! 🎉", message_type=MessageType.SYSTEM))
    db.commit()
    return ws_out(ws, current_user.id, db)

@router.get("/", response_model=List[WorkspaceOut])
def my_workspaces(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    memberships = db.query(WorkspaceMember).filter(WorkspaceMember.user_id == current_user.id).all()
    result = []
    for m in memberships:
        ws = db.query(Workspace).filter(Workspace.id == m.workspace_id).first()
        if ws:
            result.append(ws_out(ws, current_user.id, db))
    return result

@router.get("/{workspace_id}", response_model=WorkspaceOut)
def get_workspace(workspace_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(404, "Workspace not found")
    get_my_membership(workspace_id, current_user.id, db)
    return ws_out(ws, current_user.id, db)

@router.delete("/{workspace_id}")
def delete_workspace(workspace_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_owner(workspace_id, current_user.id, db)
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    db.delete(ws)
    db.commit()
    return {"message": "Workspace deleted"}

# ── invite ────────────────────────────────────────────────────────────────────

@router.post("/join/{invite_code}", response_model=WorkspaceOut)
def join_via_invite(invite_code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ws = db.query(Workspace).filter(Workspace.invite_code == invite_code).first()
    if not ws:
        raise HTTPException(404, "Invalid invite code")
    existing = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == ws.id, WorkspaceMember.user_id == current_user.id).first()
    if existing:
        return ws_out(ws, current_user.id, db)
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role=WorkspaceRole.MEMBER))
    # auto-join all public rooms
    pub_rooms = db.query(WorkspaceRoom).filter(WorkspaceRoom.workspace_id == ws.id, WorkspaceRoom.is_private == False).all()
    for wr in pub_rooms:
        room = db.query(Room).filter(Room.name == wr.name).first()
        if room:
            already = db.query(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == current_user.id).first()
            if not already:
                db.add(RoomMember(room_id=room.id, user_id=current_user.id))
    db.commit()
    return ws_out(ws, current_user.id, db)

@router.post("/{workspace_id}/regenerate-invite", response_model=WorkspaceOut)
def regenerate_invite(workspace_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_admin(workspace_id, current_user.id, db)
    import secrets
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    ws.invite_code = secrets.token_urlsafe(8)
    db.commit()
    return ws_out(ws, current_user.id, db)

# ── members ───────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/members", response_model=List[WorkspaceMemberOut])
def get_members(workspace_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_my_membership(workspace_id, current_user.id, db)
    members = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id).all()
    online_ids = manager.get_online_user_ids()
    result = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        if u:
            result.append(WorkspaceMemberOut(
                id=m.id, user_id=u.id, username=u.username,
                display_name=u.display_name, avatar_url=u.avatar_url,
                role=m.role, is_muted=m.is_muted,
                is_online=u.id in online_ids, joined_at=m.joined_at
            ))
    return result

@router.patch("/{workspace_id}/members/role")
async def update_role(workspace_id: int, data: RoleUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    me = require_admin(workspace_id, current_user.id, db)
    if data.user_id == current_user.id:
        raise HTTPException(400, "Cannot change your own role")
    target = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == data.user_id).first()
    if not target:
        raise HTTPException(404, "Member not found")
    if target.role == WorkspaceRole.OWNER:
        raise HTTPException(403, "Cannot change owner's role")
    if me.role == WorkspaceRole.ADMIN and data.role == WorkspaceRole.OWNER:
        raise HTTPException(403, "Only owner can promote to owner")
    target.role = data.role
    db.commit()
    member_ids = [m.user_id for m in db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id).all()]
    await manager.broadcast_to_room(member_ids, {"type": "role_updated", "payload": {"workspace_id": workspace_id, "user_id": data.user_id, "role": data.role}})
    return {"message": f"Role updated to {data.role}"}

@router.patch("/{workspace_id}/members/mute")
async def mute_member(workspace_id: int, data: MuteUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_admin(workspace_id, current_user.id, db)
    target = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == data.user_id).first()
    if not target:
        raise HTTPException(404, "Member not found")
    if target.role == WorkspaceRole.OWNER:
        raise HTTPException(403, "Cannot mute the owner")
    target.is_muted = data.is_muted
    db.commit()
    await manager.send_to_user(data.user_id, {"type": "mute_status", "payload": {"workspace_id": workspace_id, "is_muted": data.is_muted}})
    return {"message": "Mute status updated"}

@router.delete("/{workspace_id}/members/{user_id}")
async def remove_member(workspace_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_admin(workspace_id, current_user.id, db)
    target = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id).first()
    if not target:
        raise HTTPException(404, "Member not found")
    if target.role == WorkspaceRole.OWNER:
        raise HTTPException(403, "Cannot remove the owner")
    db.delete(target)
    db.commit()
    await manager.send_to_user(user_id, {"type": "removed_from_workspace", "payload": {"workspace_id": workspace_id}})
    return {"message": "Member removed"}

# ── rooms ─────────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/rooms", response_model=List[WorkspaceRoomOut])
def get_workspace_rooms(workspace_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    me = get_my_membership(workspace_id, current_user.id, db)
    rooms = db.query(WorkspaceRoom).filter(WorkspaceRoom.workspace_id == workspace_id).all()
    if me.role == WorkspaceRole.MEMBER:
        rooms = [r for r in rooms if not r.is_private]
    return rooms

@router.post("/{workspace_id}/rooms", response_model=WorkspaceRoomOut)
def create_workspace_room(workspace_id: int, data: WorkspaceRoomCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_admin(workspace_id, current_user.id, db)
    wr = WorkspaceRoom(workspace_id=workspace_id, name=data.name, description=data.description, is_private=data.is_private, created_by=current_user.id)
    db.add(wr)
    room = Room(name=data.name, description=data.description, room_type=RoomType.PRIVATE if data.is_private else RoomType.PUBLIC, created_by=current_user.id)
    db.add(room)
    db.commit()
    db.refresh(room)
    # auto-add all workspace members to public rooms
    if not data.is_private:
        members = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id).all()
        for m in members:
            db.add(RoomMember(room_id=room.id, user_id=m.user_id))
    else:
        db.add(RoomMember(room_id=room.id, user_id=current_user.id, is_admin=True))
    db.commit()
    return wr

@router.delete("/{workspace_id}/rooms/{room_name}")
def delete_workspace_room(workspace_id: int, room_name: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_admin(workspace_id, current_user.id, db)
    wr = db.query(WorkspaceRoom).filter(WorkspaceRoom.workspace_id == workspace_id, WorkspaceRoom.name == room_name).first()
    if not wr:
        raise HTTPException(404, "Room not found")
    db.delete(wr)
    db.commit()
    return {"message": "Room deleted"}

# ── pinned messages ───────────────────────────────────────────────────────────

@router.post("/{workspace_id}/pin/{message_id}")
async def pin_message(workspace_id: int, message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_admin(workspace_id, current_user.id, db)
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(404, "Message not found")
    existing = db.query(PinnedMessage).filter(PinnedMessage.message_id == message_id).first()
    if existing:
        raise HTTPException(400, "Already pinned")
    pin = PinnedMessage(workspace_id=workspace_id, room_id=msg.room_id, message_id=message_id, pinned_by=current_user.id)
    db.add(pin)
    db.commit()
    member_ids = [m.user_id for m in db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id).all()]
    await manager.broadcast_to_room(member_ids, {"type": "message_pinned", "payload": {"message_id": message_id, "room_id": msg.room_id, "workspace_id": workspace_id}})
    return {"message": "Pinned"}

@router.delete("/{workspace_id}/pin/{message_id}")
def unpin_message(workspace_id: int, message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_admin(workspace_id, current_user.id, db)
    pin = db.query(PinnedMessage).filter(PinnedMessage.workspace_id == workspace_id, PinnedMessage.message_id == message_id).first()
    if pin:
        db.delete(pin)
        db.commit()
    return {"message": "Unpinned"}

@router.get("/{workspace_id}/pins")
def get_pinned(workspace_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_my_membership(workspace_id, current_user.id, db)
    pins = db.query(PinnedMessage).filter(PinnedMessage.workspace_id == workspace_id).all()
    result = []
    for p in pins:
        msg = db.query(Message).filter(Message.id == p.message_id).first()
        pinner = db.query(User).filter(User.id == p.pinned_by).first()
        if msg:
            result.append({"pin_id": p.id, "message_id": p.message_id, "room_id": p.room_id, "content": msg.content, "pinned_by": pinner.display_name or pinner.username if pinner else "Unknown", "pinned_at": p.pinned_at})
    return result
