import uuid
from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.restaurants import Restaurant
    from models.table_sessions import TableSession


class RestaurantTable(SQLModel, table=True):
    __tablename__ = "restaurant_tables"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    restaurant_id: str = Field(foreign_key="restaurants.rut", nullable=False)
    table_number: str = Field(max_length=20, nullable=False)

    # Unique constraint on (restaurant_id, table_number)
    __table_args__ = (
        UniqueConstraint("restaurant_id", "table_number", name="uq_restaurant_tables_restaurant_table"),
    )

    # Relationships
    restaurant: "Restaurant" = Relationship(back_populates="tables")
    sessions: list["TableSession"] = Relationship(back_populates="table")

