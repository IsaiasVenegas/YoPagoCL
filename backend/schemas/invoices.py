import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


class InvoiceItemCreate(BaseModel):
    item_assignment_id: uuid.UUID


class InvoiceCreate(BaseModel):
    session_id: uuid.UUID
    group_id: uuid.UUID
    creditor_id: uuid.UUID  # User who paid
    debtor_id: uuid.UUID  # User who owes
    total_amount: int = Field(..., description="Amount in centavos")
    description: Optional[str] = None
    currency: str = Field(default="CLP", max_length=3)
    due_date: Optional[date] = None
    invoice_items: list[InvoiceItemCreate]


class InvoiceUpdate(BaseModel):
    status: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[date] = None


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    group_id: Optional[uuid.UUID]
    total_amount: int
    description: Optional[str]
    created_at: datetime
    currency: str
    status: str
    settlement_id: Optional[uuid.UUID]
    due_date: Optional[date]
    paid_at: Optional[datetime]
    updated_at: datetime

    class Config:
        from_attributes = True


class AvailableGroupsResponse(BaseModel):
    groups: list[dict]  # List of groups where both users are members


class InvoiceMarkPaid(BaseModel):
    paid_at: Optional[datetime] = None

