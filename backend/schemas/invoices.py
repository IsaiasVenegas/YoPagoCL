import uuid
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


class InvoiceItemCreate(BaseModel):
    item_assignment_id: uuid.UUID


class InvoiceCreate(BaseModel):
    session_id: uuid.UUID
    group_id: uuid.UUID
    from_user: uuid.UUID  # User who pays
    to_user: uuid.UUID  # User who receives
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
    from_user: uuid.UUID
    to_user: uuid.UUID
    total_amount: int
    description: Optional[str]
    created_at: datetime
    currency: str
    status: str
    due_date: Optional[date]
    paid_at: Optional[datetime]
    updated_at: datetime

    class Config:
        from_attributes = True


class AvailableGroupsResponse(BaseModel):
    groups: list[dict]  # List of groups where both users are members


class InvoiceMarkPaid(BaseModel):
    paid_at: Optional[datetime] = None


class BillPaymentRequest(BaseModel):
    session_id: uuid.UUID
    group_id: uuid.UUID
    amount: int = Field(..., description="Total amount to pay in centavos")
    currency: str = Field(default="CLP", max_length=3)


class BillPaymentResponse(BaseModel):
    payment_id: str
    invoices: list[InvoiceResponse]
    transbank_token: Optional[str] = None

