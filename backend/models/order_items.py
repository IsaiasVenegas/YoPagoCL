import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, func
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.table_sessions import TableSession
    from models.item_assignments import ItemAssignment


class OrderItem(SQLModel, table=True):
    __tablename__ = "order_items"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    session_id: uuid.UUID = Field(foreign_key="table_sessions.id", nullable=False)
    item_name: str = Field(max_length=200, nullable=False)
    unit_price: int = Field(nullable=False)  # in centavos
    ordered_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    # Relationships
    session: "TableSession" = Relationship(back_populates="order_items")
    assignments: list["ItemAssignment"] = Relationship(back_populates="order_item")

