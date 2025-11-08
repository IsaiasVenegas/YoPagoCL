import uuid
from datetime import datetime, date
from sqlalchemy import Column, DateTime, func
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.table_sessions import TableSession
    from models.groups import Group
    from models.payments import Payment
    from models.invoice_items import InvoiceItem
    from models.payment_reminders import PaymentReminder


class Invoice(SQLModel, table=True):
    __tablename__ = "invoices"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    session_id: uuid.UUID = Field(foreign_key="table_sessions.id", nullable=False)
    group_id: uuid.UUID | None = Field(foreign_key="groups.id", default=None, nullable=True)
    total_amount: int = Field(nullable=False)  # in centavos
    description: str | None = Field(default=None, nullable=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    )
    currency: str = Field(default="CLP", max_length=3, nullable=False)
    status: str = Field(default="pending", max_length=20, nullable=False)  # pending, paid, cancelled
    payment_id: uuid.UUID | None = Field(foreign_key="payments.id", default=None, nullable=True)
    due_date: date | None = Field(default=None, nullable=True)
    paid_at: datetime | None = Field(default=None, nullable=True)
    frequency_cycle: str = Field(default="daily", max_length=20, nullable=False)  # daily, weekly, monthly, none
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    )

    # Relationships
    session: "TableSession" = Relationship(back_populates="invoices")
    group: "Group | None" = Relationship()
    payment: "Payment | None" = Relationship(back_populates="invoice")
    invoice_items: list["InvoiceItem"] = Relationship(back_populates="invoice")
    payment_reminders: list["PaymentReminder"] = Relationship(back_populates="invoice")

