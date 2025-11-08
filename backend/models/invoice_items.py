import uuid
from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.invoices import Invoice
    from models.item_assignments import ItemAssignment


class InvoiceItem(SQLModel, table=True):
    __tablename__ = "invoice_items"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    invoice_id: uuid.UUID = Field(foreign_key="invoices.id", nullable=False)
    item_assignment_id: uuid.UUID = Field(foreign_key="item_assignments.id", nullable=False)

    # Unique constraint on (invoice_id, item_assignment_id)
    __table_args__ = (
        UniqueConstraint("invoice_id", "item_assignment_id", name="uq_invoice_items_invoice_assignment"),
    )

    # Relationships
    invoice: "Invoice" = Relationship(back_populates="invoice_items")
    item_assignment: "ItemAssignment" = Relationship(back_populates="invoice_items")

