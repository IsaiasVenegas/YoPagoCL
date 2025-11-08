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
    creditor_id: uuid.UUID,
    debtor_id: uuid.UUID
) -> tuple[bool, Optional[str]]:
    """Validate that both users are in the group. Returns (is_valid, error_message)."""
    # Import here to avoid circular dependency
    from models.group_members import GroupMember
    
    creditor_member = db.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == creditor_id
        )
    ).first()
    
    if not creditor_member:
        return False, f"Creditor user {creditor_id} is not a member of group {group_id}"
    
    debtor_member = db.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == debtor_id
        )
    ).first()
    
    if not debtor_member:
        return False, f"Debtor user {debtor_id} is not a member of group {group_id}"
    
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
    
    # If user_id is provided, we need to filter by invoices where user is involved
    # This requires checking invoice items and their assignments
    if user_id:
        # Get invoices where user is creditor through assignments
        creditor_invoices = db.exec(
            select(Invoice)
            .join(InvoiceItem, InvoiceItem.invoice_id == Invoice.id)
            .join(ItemAssignment, ItemAssignment.id == InvoiceItem.item_assignment_id)
            .join(TableParticipant, TableParticipant.id == ItemAssignment.creditor_id)
            .where(TableParticipant.user_id == user_id)
        ).all()
        
        # Get invoices where user is debtor through assignments
        debtor_invoices = db.exec(
            select(Invoice)
            .join(InvoiceItem, InvoiceItem.invoice_id == Invoice.id)
            .join(ItemAssignment, ItemAssignment.id == InvoiceItem.item_assignment_id)
            .join(TableParticipant, TableParticipant.id == ItemAssignment.debtor_id)
            .where(TableParticipant.user_id == user_id)
        ).all()
        
        # Combine and deduplicate
        all_invoice_ids = {inv.id for inv in creditor_invoices + debtor_invoices}
        if all_invoice_ids:
            query = query.where(Invoice.id.in_(all_invoice_ids))
        else:
            # No invoices found for this user
            return []
    
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
    """Mark invoice as paid."""
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        return None
    
    invoice.status = "paid"
    invoice.paid_at = paid_at or datetime.now()
    
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    
    return invoice


def get_user_invoices(
    db: Session,
    user_id: uuid.UUID
) -> list[Invoice]:
    """Get all invoices for a user (as creditor or debtor)."""
    # Get invoices where user is involved through assignments
    # This requires joining through invoice_items -> item_assignments -> table_participants
    query_creditor = (
        select(Invoice)
        .join(InvoiceItem, InvoiceItem.invoice_id == Invoice.id)
        .join(ItemAssignment, ItemAssignment.id == InvoiceItem.item_assignment_id)
        .join(TableParticipant, TableParticipant.id == ItemAssignment.creditor_id)
        .where(TableParticipant.user_id == user_id)
    )
    
    invoices = db.exec(query_creditor).all()
    
    # Also get invoices where user is debtor
    query_debtor = (
        select(Invoice)
        .join(InvoiceItem, InvoiceItem.invoice_id == Invoice.id)
        .join(ItemAssignment, ItemAssignment.id == InvoiceItem.item_assignment_id)
        .join(TableParticipant, TableParticipant.id == ItemAssignment.debtor_id)
        .where(TableParticipant.user_id == user_id)
    )
    
    debtor_invoices = db.exec(query_debtor).all()
    
    # Combine and deduplicate
    all_invoices = {inv.id: inv for inv in invoices + debtor_invoices}
    return list(all_invoices.values())


def get_user_pending_invoices(
    db: Session,
    user_id: uuid.UUID
) -> list[Invoice]:
    """Get pending invoices for a user."""
    invoices = get_user_invoices(db, user_id)
    return [inv for inv in invoices if inv.status == "pending"]

