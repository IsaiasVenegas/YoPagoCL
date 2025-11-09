import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from pydantic import BaseModel, Field

# Import at runtime for forward reference resolution
from schemas.auth import UserResponse


class GroupCreate(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    currency: str = Field(default="CLP", max_length=3)


class GroupUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None


class GroupMemberAdd(BaseModel):
    user_id: uuid.UUID


class GroupResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str]
    currency: str
    created_at: datetime
    updated_at: datetime
    created_by: uuid.UUID

    class Config:
        from_attributes = True


class GroupMemberResponse(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    user_id: uuid.UUID
    joined_at: datetime
    user: Optional["UserResponse"] = None

    class Config:
        from_attributes = True

