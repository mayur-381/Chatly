from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..core.database import get_db
from ..core.security import get_current_user
from ..core.websocket_manager import manager
from ..models.reaction import Reaction
from ..models.message import Message
from ..models.room import RoomMember
from ..models.user import User

router = APIRouter(prefix="/api/reactions", tags=["reactions"])

ALLOWED_EMOJIS = {"👍","👎","❤️","😂","😮","😢","🔥","🎉","👀","✅"}

def get_reaction_summary(message_id: int, db: Session) -> list:
    rows = db.query(Reaction.emoji, func.count(Reaction.id).label("count"))\
             .filter(Reaction.message_id == message_id)\
             .group_by(Reaction.emoji).all()
    result = []
    for row in rows:
        users = db.query(Reaction.user_id).filter(Reaction.message_id == message_id, Reaction.emoji == row.emoji).all()
        result.append({"emoji": row.emoji, "count": row.count, "user_ids": [u[0] for u in users]})
    return result

@router.post("/{message_id}/toggle")
async def toggle_reaction(
    message_id: int,
    emoji: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if emoji not in ALLOWED_EMOJIS:
        raise HTTPException(400, "Emoji not allowed")
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(404, "Message not found")
    member = db.query(RoomMember).filter(RoomMember.room_id == msg.room_id, RoomMember.user_id == current_user.id).first()
    if not member:
        raise HTTPException(403, "Not a member")

    existing = db.query(Reaction).filter(
        Reaction.message_id == message_id,
        Reaction.user_id == current_user.id,
        Reaction.emoji == emoji
    ).first()

    if existing:
        db.delete(existing)
        action = "removed"
    else:
        db.add(Reaction(message_id=message_id, user_id=current_user.id, emoji=emoji))
        action = "added"
    db.commit()

    summary = get_reaction_summary(message_id, db)
    member_ids = [m.user_id for m in db.query(RoomMember).filter(RoomMember.room_id == msg.room_id).all()]
    await manager.broadcast_to_room(member_ids, {
        "type": "reaction_update",
        "payload": {
            "message_id": message_id,
            "room_id": msg.room_id,
            "reactions": summary
        }
    })
    return {"action": action, "reactions": summary}

@router.get("/{message_id}")
def get_reactions(message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_reaction_summary(message_id, db)
