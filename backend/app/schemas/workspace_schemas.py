from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from ..models.workspace import WorkspaceRole

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = "💬"

class WorkspaceOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    icon: str
    invite_code: str
    owner_id: int
    created_at: datetime
    member_count: int = 0
    my_role: WorkspaceRole = WorkspaceRole.MEMBER
    class Config: from_attributes = True

class WorkspaceMemberOut(BaseModel):
    id: int
    user_id: int
    username: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    role: WorkspaceRole
    is_muted: bool
    is_online: bool = False
    joined_at: datetime
    class Config: from_attributes = True

class WorkspaceRoomCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_private: bool = False

class WorkspaceRoomOut(BaseModel):
    id: int
    workspace_id: int
    name: str
    description: Optional[str]
    is_private: bool
    created_by: Optional[int]
    created_at: datetime
    class Config: from_attributes = True

class RoleUpdate(BaseModel):
    user_id: int
    role: WorkspaceRole

class MuteUpdate(BaseModel):
    user_id: int
    is_muted: bool
