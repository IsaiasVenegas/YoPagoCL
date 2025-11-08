import uuid
from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.order_items import OrderItem
    from models.table_participants import TableParticipant
    from models.invoice_items import InvoiceItem


class ItemAssignment(SQLModel, table=True):
    __tablename__ = "item_assignments"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        sa_column_kwargs={"nullable": False}
    )
    order_item_id: uuid.UUID = Field(foreign_key="order_items.id", nullable=False)
    creditor_id: uuid.UUID = Field(foreign_key="table_participants.id", nullable=False)
    debtor_id: uuid.UUID | None = Field(foreign_key="table_participants.id", default=None, nullable=True)
    assigned_amount: int = Field(nullable=False)  # in centavos

    # Relationships
    order_item: "OrderItem" = Relationship(back_populates="assignments")
    creditor: "TableParticipant" = Relationship(
        back_populates="creditor_assignments"
    )
    debtor: "TableParticipant | None" = Relationship(
        back_populates="debtor_assignments"
    )
    invoice_items: list["InvoiceItem"] = Relationship(back_populates="item_assignment")

