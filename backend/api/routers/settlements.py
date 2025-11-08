import uuid
from typing import Optional
from fastapi import APIRouter, Query
from sqlmodel import select

from api.deps import SessionDep
from models.settlements import Settlement
from schemas.settlements import SettlementCreate, SettlementResponse

router = APIRouter(prefix="/settlements", tags=["settlements"])


@router.post("", response_model=SettlementResponse, status_code=201)
def create_settlement(settlement_data: SettlementCreate, db: SessionDep):
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


@router.get("", response_model=list[SettlementResponse])
def list_settlements(
    user_id: Optional[uuid.UUID] = Query(None, description="Filter by user (from_user or to_user)"),
    group_id: Optional[uuid.UUID] = Query(None, description="Filter by group"),
    invoice_id: Optional[uuid.UUID] = Query(None, description="Filter by invoice"),
    db: SessionDep = None
):
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
        from models.invoices import Invoice
        query = (
            query
            .join(Invoice, Invoice.id == Settlement.invoice_id)
            .where(Invoice.group_id == group_id)
        )
    
    settlements = db.exec(query).all()
    return settlements


@router.get("/groups/{group_id}/settlements", response_model=list[SettlementResponse])
def get_group_settlements(group_id: uuid.UUID, db: SessionDep):
    """Get settlements for a group."""
    from models.invoices import Invoice
    
    query = (
        select(Settlement)
        .join(Invoice, Invoice.id == Settlement.invoice_id)
        .where(Invoice.group_id == group_id)
    )
    
    settlements = db.exec(query).all()
    return settlements

