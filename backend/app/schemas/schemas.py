from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional
from ..models.room import RoomType
from ..models.message import MessageType

class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    display_name: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    id: int
    username: str
    email: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    bio: Optional[str]
    is_active: bool
    created_at: datetime
    is_online: bool = False
    class Config: from_attributes = True

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class RoomCreate(BaseModel):
    name: str
    description: Optional[str] = None
    room_type: RoomType = RoomType.PUBLIC

class RoomOut(BaseModel):
    id: int
    name: Optional[str]
    description: Optional[str]
    room_type: RoomType
    created_by: Optional[int]
    avatar_url: Optional[str]
    created_at: datetime
    member_count: int = 0
    unread_count: int = 0
    last_message: Optional[str] = None
    class Config: from_attributes = True

class MessageOut(BaseModel):
    id: int
    room_id: int
    sender_id: int
    content: Optional[str]
    message_type: MessageType
    file_url: Optional[str]
    file_name: Optional[str]
    file_size: Optional[int]
    reply_to_id: Optional[int]
    is_deleted: bool
    edited_at: Optional[datetime]
    created_at: datetime
    sender: UserOut
    class Config: from_attributes = True

class NotificationOut(BaseModel):
    id: int
    user_id: int
    room_id: Optional[int]
    message_id: Optional[int]
    content: str
    is_read: bool
    created_at: datetime
    class Config: from_attributes = True

class DMCreate(BaseModel):
    target_user_id: int
