import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.invoices import Invoice


class PaymentReminder(SQLModel, table=True):
    __tablename__ = "payment_reminders"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    invoice_id: uuid.UUID = Field(foreign_key="invoices.id", nullable=False)
    send_at: datetime = Field(nullable=False)
    message: str | None = Field(default=None, nullable=True)
    near_to_due_date: bool = Field(default=False, nullable=False)
    status: str = Field(default="pending", max_length=20, nullable=False)  # pending, sent, cancelled

    # Relationships
    invoice: "Invoice" = Relationship(back_populates="payment_reminders")

