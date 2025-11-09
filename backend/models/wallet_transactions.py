import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, func
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING, Optional

from core.config import settings

if TYPE_CHECKING:
    from models.wallets import Wallet
    from models.settlements import Settlement


class WalletTransaction(SQLModel, table=True):
    __tablename__ = "wallet_transactions"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    wallet_id: uuid.UUID = Field(foreign_key="wallets.id", nullable=False)
    settlement_id: uuid.UUID | None = Field(foreign_key="settlements.id", default=None, nullable=True)
    type: str = Field(nullable=False, max_length=50)  # payment_sent, payment_received, deposit, withdrawal
    amount: int = Field(nullable=False)  # in centavos (positivo o negativo según tipo)
    currency: str = Field(default="CLP", max_length=3, nullable=False)
    description: str | None = Field(default=None, nullable=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(settings.APP_TIMEZONE),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )

    # Relationships
    wallet: "Wallet" = Relationship(back_populates="transactions")
    settlement: Optional["Settlement"] = Relationship(back_populates="wallet_transactions")

