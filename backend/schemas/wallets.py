import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class WalletResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    balance: int
    currency: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WalletTransactionResponse(BaseModel):
    id: uuid.UUID
    wallet_id: uuid.UUID
    settlement_id: Optional[uuid.UUID]
    type: str
    amount: int
    currency: str
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class WalletWithTransactionsResponse(WalletResponse):
    transactions: list[WalletTransactionResponse] = []

    class Config:
        from_attributes = True


class WalletTransactionCreate(BaseModel):
    wallet_id: uuid.UUID
    settlement_id: Optional[uuid.UUID] = None
    type: str = Field(..., description="payment_sent, payment_received, deposit, withdrawal")
    amount: int = Field(..., description="Amount in centavos")
    currency: str = Field(default="CLP", max_length=3)
    description: Optional[str] = None

