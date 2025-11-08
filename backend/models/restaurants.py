import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, func
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.users import User
    from models.restaurant_tables import RestaurantTable
    from models.table_sessions import TableSession


class Restaurant(SQLModel, table=True):
    __tablename__ = "restaurants"

    rut: str = Field(primary_key=True, nullable=False)
    name: str = Field(max_length=100, nullable=False)
    slug: str = Field(max_length=100, nullable=False)
    owner: uuid.UUID = Field(foreign_key="users.id", nullable=False)
    description: str | None = Field(default=None, nullable=True)
    img_url: str | None = Field(default=None, max_length=500, nullable=True)
    address: str | None = Field(default=None, nullable=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    )

    # Relationships
    owner_user: "User" = Relationship()
    tables: list["RestaurantTable"] = Relationship(back_populates="restaurant")
    sessions: list["TableSession"] = Relationship(back_populates="restaurant")

