import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, func
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.users import User
    from models.group_members import GroupMember


class Group(SQLModel, table=True):
    __tablename__ = "groups"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    name: str = Field(max_length=100, nullable=False)
    slug: str = Field(max_length=12, nullable=False)
    description: str | None = Field(default=None, nullable=True)
    currency: str = Field(default="CLP", max_length=3, nullable=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    )
    created_by: uuid.UUID = Field(foreign_key="users.id", nullable=False)

    # Relationships
    creator: "User" = Relationship(back_populates="created_groups")
    members: list["GroupMember"] = Relationship(back_populates="group")
