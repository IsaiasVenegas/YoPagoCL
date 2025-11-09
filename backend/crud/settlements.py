import uuid
from typing import Optional
from sqlmodel import select, Session
from models.settlements import Settlement
from models.invoices import Invoice
from schemas.settlements import SettlementCreate
from crud.wallets import get_or_create_wallet, create_wallet_transaction


def create_settlement(
    db: Session,
    settlement_data: SettlementCreate
) -> Settlement:
    """Create a settlement and associated wallet transactions."""
    settlement = Settlement(
        invoice_id=settlement_data.invoice_id,
        table_session_id=settlement_data.table_session_id,
        from_user=settlement_data.from_user,
        to_user=settlement_data.to_user,
        amount=settlement_data.amount,
        currency=settlement_data.currency,
        settlement_date=settlement_data.settlement_date,
        payment_method=settlement_data.payment_method
    )
    db.add(settlement)
    db.flush()  # Flush to get settlement.id without committing
    
    # Get or create wallets for both users (without committing)
    from_wallet = get_or_create_wallet(db, settlement_data.from_user, commit=False)
    to_wallet = get_or_create_wallet(db, settlement_data.to_user, commit=False)
    
    # Create transaction for from_user (payment sent - negative amount)
    create_wallet_transaction(
        db=db,
        wallet_id=from_wallet.id,
        transaction_type="payment_sent",
        amount=-settlement_data.amount,  # Negative because money goes out
        settlement_id=settlement.id,
        currency=settlement_data.currency,
        description=f"Payment to user {settlement_data.to_user}",
        commit=False
    )
    
    # Create transaction for to_user (payment received - positive amount)
    create_wallet_transaction(
        db=db,
        wallet_id=to_wallet.id,
        transaction_type="payment_received",
        amount=settlement_data.amount,  # Positive because money comes in
        settlement_id=settlement.id,
        currency=settlement_data.currency,
        description=f"Payment from user {settlement_data.from_user}",
        commit=False
    )
    
    # Single commit for all operations
    db.commit()
    db.refresh(settlement)
    
    return settlement


def list_settlements(
    db: Session,
    user_id: Optional[uuid.UUID] = None,
    group_id: Optional[uuid.UUID] = None,
    invoice_id: Optional[uuid.UUID] = None,
    table_session_id: Optional[uuid.UUID] = None
) -> list[Settlement]:
    """List settlements with optional filters."""
    query = select(Settlement)
    
    if invoice_id:
        query = query.where(Settlement.invoice_id == invoice_id)
    
    if table_session_id:
        query = query.where(Settlement.table_session_id == table_session_id)
    
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

