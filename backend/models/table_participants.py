import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, func
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.table_sessions import TableSession
    from models.users import User
    from models.item_assignments import ItemAssignment


class TableParticipant(SQLModel, table=True):
    __tablename__ = "table_participants"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    session_id: uuid.UUID = Field(foreign_key="table_sessions.id", nullable=False)
    user_id: uuid.UUID | None = Field(foreign_key="users.id", default=None, nullable=True)
    joined_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    # Relationships
    session: "TableSession" = Relationship(back_populates="participants")
    user: "User | None" = Relationship()
    creditor_assignments: list["ItemAssignment"] = Relationship(
        back_populates="creditor"
    )
    debtor_assignments: list["ItemAssignment"] = Relationship(
        back_populates="debtor"
    )

