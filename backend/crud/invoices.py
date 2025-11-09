import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import select, Session
from models.invoices import Invoice
from models.invoice_items import InvoiceItem
from models.item_assignments import ItemAssignment
from models.table_participants import TableParticipant
from schemas.invoices import InvoiceCreate, InvoiceUpdate, InvoiceMarkPaid


def validate_users_in_group(
    db: Session,
    group_id: uuid.UUID,
    from_user: uuid.UUID,
    to_user: uuid.UUID
) -> tuple[bool, Optional[str]]:
    """Validate that both users are in the group. Returns (is_valid, error_message)."""
    # Import here to avoid circular dependency
    from models.group_members import GroupMember
    
    from_member = db.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == from_user
        )
    ).first()
    
    if not from_member:
        return False, f"User {from_user} is not a member of group {group_id}"
    
    to_member = db.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == to_user
        )
    ).first()
    
    if not to_member:
        return False, f"User {to_user} is not a member of group {group_id}"
    
    return True, None


def create_invoice(
    db: Session,
    invoice_data: InvoiceCreate
) -> Invoice:
    """Create an invoice after closing a session."""
    # Create invoice
    invoice = Invoice(
        session_id=invoice_data.session_id,
        group_id=invoice_data.group_id,
        from_user=invoice_data.from_user,
        to_user=invoice_data.to_user,
        total_amount=invoice_data.total_amount,
        description=invoice_data.description,
        currency=invoice_data.currency,
        due_date=invoice_data.due_date,
        status="pending"
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    
    # Create invoice items
    for item_data in invoice_data.invoice_items:
        invoice_item = InvoiceItem(
            invoice_id=invoice.id,
            item_assignment_id=item_data.item_assignment_id
        )
        db.add(invoice_item)
    
    db.commit()
    db.refresh(invoice)
    
    return invoice


def get_invoice_by_id(
    db: Session,
    invoice_id: uuid.UUID
) -> Invoice | None:
    """Get invoice by ID."""
    return db.get(Invoice, invoice_id)


def list_invoices(
    db: Session,
    user_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    group_id: Optional[uuid.UUID] = None
) -> list[Invoice]:
    """List invoices with optional filters."""
    query = select(Invoice)
    
    if group_id:
        query = query.where(Invoice.group_id == group_id)
    
    if status:
        query = query.where(Invoice.status == status)
    
    # If user_id is provided, filter by invoices where user is from_user or to_user
    if user_id:
        query = query.where(
            (Invoice.from_user == user_id) | (Invoice.to_user == user_id)
        )
    
    return db.exec(query).all()


def update_invoice(
    db: Session,
    invoice_id: uuid.UUID,
    invoice_data: InvoiceUpdate
) -> Invoice | None:
    """Update invoice."""
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        return None
    
    if invoice_data.status:
        invoice.status = invoice_data.status
    if invoice_data.description is not None:
        invoice.description = invoice_data.description
    if invoice_data.due_date is not None:
        invoice.due_date = invoice_data.due_date
    
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    
    return invoice


def mark_invoice_paid(
    db: Session,
    invoice_id: uuid.UUID,
    paid_at: Optional[datetime] = None
) -> Invoice | None:
    """Mark invoice as paid and create wallet transactions."""
    from crud.wallets import get_or_create_wallet, create_wallet_transaction
    
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        return None
    
    # Mark as paid
    invoice.status = "paid"
    invoice.paid_at = paid_at or datetime.now()
    db.add(invoice)
    db.flush()  # Flush to get invoice.id without committing
    
    # Get or create wallets for both users (without committing)
    from_wallet = get_or_create_wallet(db, invoice.from_user, commit=False)
    to_wallet = get_or_create_wallet(db, invoice.to_user, commit=False)
    
    # Create transaction for from_user (payment sent - negative amount)
    create_wallet_transaction(
        db=db,
        wallet_id=from_wallet.id,
        transaction_type="payment_sent",
        amount=-invoice.total_amount,  # Negative because money goes out
        invoice_id=invoice.id,
        currency=invoice.currency,
        description=f"Payment to user {invoice.to_user}",
        commit=False
    )
    
    # Create transaction for to_user (payment received - positive amount)
    create_wallet_transaction(
        db=db,
        wallet_id=to_wallet.id,
        transaction_type="payment_received",
        amount=invoice.total_amount,  # Positive because money comes in
        invoice_id=invoice.id,
        currency=invoice.currency,
        description=f"Payment from user {invoice.from_user}",
        commit=False
    )
    
    # Single commit for all operations
    db.commit()
    db.refresh(invoice)
    
    return invoice


def get_user_invoices(
    db: Session,
    user_id: uuid.UUID
) -> list[Invoice]:
    """Get all invoices for a user (as from_user or to_user)."""
    query = select(Invoice).where(
        (Invoice.from_user == user_id) | (Invoice.to_user == user_id)
    )
    return db.exec(query).all()


def get_user_pending_invoices(
    db: Session,
    user_id: uuid.UUID
) -> list[Invoice]:
    """Get pending invoices for a user."""
    invoices = get_user_invoices(db, user_id)
    return [inv for inv in invoices if inv.status == "pending"]

