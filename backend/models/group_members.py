import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, func, UniqueConstraint
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.groups import Group
    from models.users import User


class GroupMember(SQLModel, table=True):
    __tablename__ = "group_members"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    group_id: uuid.UUID = Field(foreign_key="groups.id", nullable=False)
    user_id: uuid.UUID = Field(foreign_key="users.id", nullable=False)
    joined_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    # Unique constraint on (group_id, user_id)
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_group_members_group_user"),
    )

    # Relationships
    group: "Group" = Relationship(back_populates="members")
    user: "User" = Relationship(back_populates="group_memberships")
