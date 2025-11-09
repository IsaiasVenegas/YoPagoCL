import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, func
from sqlmodel import SQLModel, Field, Index, Relationship
from typing import TYPE_CHECKING, Optional

from core.config import settings

if TYPE_CHECKING:
    from models.groups import Group
    from models.group_members import GroupMember
    from models.wallets import Wallet


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    name: str = Field(max_length=100, nullable=False)
    email: str = Field(max_length=100, unique=True, nullable=False, index=True)
    phone: str | None = Field(default=None, max_length=20, nullable=True)
    avatar_url: str | None = Field(default=None, max_length=500, nullable=True)
    push_notification_token: str | None = Field(default=None, max_length=500, nullable=True)
    hashed_password: str | None = Field(default=None, max_length=100, nullable=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(settings.APP_TIMEZONE),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(settings.APP_TIMEZONE),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    )

    # Indexes for commonly queried fields
    __table_args__ = (
        Index("idx_user_email", "email"),
    )

    # Relationships
    created_groups: list["Group"] = Relationship(back_populates="creator")
    group_memberships: list["GroupMember"] = Relationship(back_populates="user")
    wallet: Optional["Wallet"] = Relationship(back_populates="user", sa_relationship_kwargs={"uselist": False})
