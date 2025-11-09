import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class PaymentReminderCreate(BaseModel):
    invoice_id: uuid.UUID
    send_at: datetime
    message: Optional[str] = None
    near_to_due_date: bool = Field(default=False)


class PaymentReminderResponse(BaseModel):
    id: uuid.UUID
    invoice_id: uuid.UUID
    send_at: datetime
    message: Optional[str]
    near_to_due_date: bool
    status: str

    class Config:
        from_attributes = True

