import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


class SettlementCreate(BaseModel):
    invoice_id: Optional[uuid.UUID] = None
    from_user: uuid.UUID
    to_user: uuid.UUID
    amount: int = Field(..., description="Amount in centavos")
    currency: str = Field(default="CLP", max_length=3)
    settlement_date: date
    payment_method: Optional[str] = Field(None, max_length=50)


class SettlementResponse(BaseModel):
    id: uuid.UUID
    invoice_id: Optional[uuid.UUID]
    from_user: uuid.UUID
    to_user: uuid.UUID
    amount: int
    currency: str
    settlement_date: date
    payment_method: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

