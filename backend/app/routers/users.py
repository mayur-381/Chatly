from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import os, uuid, aiofiles
from ..core.database import get_db
from ..core.security import get_current_user
from ..core.config import settings
from ..core.websocket_manager import manager
from ..models.user import User
from ..schemas.schemas import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])

@router.get("/", response_model=List[UserOut])
def get_users(search: str = "", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    online_ids = manager.get_online_user_ids()
    query = db.query(User).filter(User.id != current_user.id)
    if search:
        query = query.filter(User.username.ilike(f"%{search}%") | User.display_name.ilike(f"%{search}%"))
    users = query.limit(20).all()
    result = []
    for u in users:
        out = UserOut.model_validate(u)
        out.is_online = u.id in online_ids
        result.append(out)
    return result

@router.get("/online", response_model=List[UserOut])
def get_online_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    online_ids = manager.get_online_user_ids()
    users = db.query(User).filter(User.id.in_(online_ids)).all()
    result = []
    for u in users:
        out = UserOut.model_validate(u)
        out.is_online = True
        result.append(out)
    return result

@router.patch("/me", response_model=UserOut)
async def update_profile(
    display_name: str = None,
    bio: str = None,
    avatar: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if display_name:
        current_user.display_name = display_name
    if bio is not None:
        current_user.bio = bio
    if avatar:
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        ext = os.path.splitext(avatar.filename)[1].lower()
        fname = f"avatar_{uuid.uuid4()}{ext}"
        fpath = os.path.join(settings.UPLOAD_DIR, fname)
        async with aiofiles.open(fpath, "wb") as f:
            await f.write(await avatar.read())
        current_user.avatar_url = f"/uploads/{fname}"
    db.commit()
    db.refresh(current_user)
    out = UserOut.model_validate(current_user)
    out.is_online = True
    return out
