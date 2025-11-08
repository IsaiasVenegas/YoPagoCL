import uuid
from typing import Optional
from sqlmodel import select, Session
from models.settlements import Settlement
from models.invoices import Invoice
from schemas.settlements import SettlementCreate


def create_settlement(
    db: Session,
    settlement_data: SettlementCreate
) -> Settlement:
    """Create a settlement (payment outside restaurant)."""
    settlement = Settlement(
        invoice_id=settlement_data.invoice_id,
        from_user=settlement_data.from_user,
        to_user=settlement_data.to_user,
        amount=settlement_data.amount,
        currency=settlement_data.currency,
        settlement_date=settlement_data.settlement_date,
        payment_method=settlement_data.payment_method
    )
    db.add(settlement)
    db.commit()
    db.refresh(settlement)
    
    return settlement


def list_settlements(
    db: Session,
    user_id: Optional[uuid.UUID] = None,
    group_id: Optional[uuid.UUID] = None,
    invoice_id: Optional[uuid.UUID] = None
) -> list[Settlement]:
    """List settlements with optional filters."""
    query = select(Settlement)
    
    if invoice_id:
        query = query.where(Settlement.invoice_id == invoice_id)
    
    if user_id:
        query = query.where(
            (Settlement.from_user == user_id) | (Settlement.to_user == user_id)
        )
    
    # If group_id is provided, filter by invoices in that group
    if group_id:
        query = (
            query
            .join(Invoice, Invoice.id == Settlement.invoice_id)
            .where(Invoice.group_id == group_id)
        )
    
    return db.exec(query).all()


def get_group_settlements(
    db: Session,
    group_id: uuid.UUID
) -> list[Settlement]:
    """Get settlements for a group."""
    query = (
        select(Settlement)
        .join(Invoice, Invoice.id == Settlement.invoice_id)
        .where(Invoice.group_id == group_id)
    )
    
    return db.exec(query).all()

