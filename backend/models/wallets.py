import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, func
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

from core.config import settings

if TYPE_CHECKING:
    from models.users import User
    from models.wallet_transactions import WalletTransaction


class Wallet(SQLModel, table=True):
    __tablename__ = "wallets"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, nullable=False)
    balance: int = Field(default=0, nullable=False)  # in centavos
    currency: str = Field(default="CLP", max_length=3, nullable=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(settings.APP_TIMEZONE),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(settings.APP_TIMEZONE),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    )

    # Relationships
    user: "User" = Relationship(back_populates="wallet")
    transactions: list["WalletTransaction"] = Relationship(back_populates="wallet")

