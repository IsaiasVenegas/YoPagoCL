import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, func
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

from core.config import settings

if TYPE_CHECKING:
    from models.table_participants import TableParticipant
    from models.order_items import OrderItem
    from models.invoices import Invoice
    from models.restaurants import Restaurant
    from models.restaurant_tables import RestaurantTable


class TableSession(SQLModel, table=True):
    __tablename__ = "table_sessions"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    restaurant_id: str = Field(foreign_key="restaurants.rut", nullable=False)
    table_id: uuid.UUID = Field(foreign_key="restaurant_tables.id", nullable=False)
    session_start: datetime = Field(
        default_factory=lambda: datetime.now(settings.APP_TIMEZONE),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    session_end: datetime | None = Field(default=None, nullable=True)
    status: str = Field(default="active", max_length=20, nullable=False)  # active, closed, paid
    total_amount: int | None = Field(default=None, nullable=True)
    currency: str = Field(default="CLP", max_length=3, nullable=False)
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(settings.APP_TIMEZONE),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    )

    # Relationships
    restaurant: "Restaurant" = Relationship(back_populates="sessions")
    table: "RestaurantTable" = Relationship(back_populates="sessions")
    participants: list["TableParticipant"] = Relationship(back_populates="session")
    order_items: list["OrderItem"] = Relationship(back_populates="session")
    invoices: list["Invoice"] = Relationship(back_populates="session")

