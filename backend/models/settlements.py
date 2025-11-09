import uuid
from datetime import datetime, date
from sqlalchemy import Column, DateTime, func
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING, Optional

from core.config import settings

if TYPE_CHECKING:
    from models.invoices import Invoice
    from models.users import User
    from models.table_sessions import TableSession
    from models.wallet_transactions import WalletTransaction


class Settlement(SQLModel, table=True):
    __tablename__ = "settlements"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    invoice_id: uuid.UUID | None = Field(foreign_key="invoices.id", default=None, nullable=True)
    table_session_id: uuid.UUID | None = Field(foreign_key="table_sessions.id", default=None, nullable=True)
    from_user: uuid.UUID = Field(foreign_key="users.id", nullable=False)
    to_user: uuid.UUID = Field(foreign_key="users.id", nullable=False)
    amount: int = Field(nullable=False)  # in centavos
    currency: str = Field(default="CLP", max_length=3, nullable=False)
    settlement_date: date = Field(nullable=False)
    payment_method: str | None = Field(default=None, max_length=50, nullable=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(settings.APP_TIMEZONE),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    # Relationships
    invoice: Optional["Invoice"] = Relationship(back_populates="settlement")
    table_session: Optional["TableSession"] = Relationship(back_populates="settlement", sa_relationship_kwargs={"uselist": False})
    from_user_rel: "User" = Relationship(
        sa_relationship_kwargs={
            "foreign_keys": lambda: [Settlement.__table__.c.from_user]
        }
    )
    to_user_rel: "User" = Relationship(
        sa_relationship_kwargs={
            "foreign_keys": lambda: [Settlement.__table__.c.to_user]
        }
    )
    wallet_transactions: list["WalletTransaction"] = Relationship(back_populates="settlement")