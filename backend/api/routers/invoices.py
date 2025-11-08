import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from api.deps import SessionDep
from models.invoices import Invoice
from models.invoice_items import InvoiceItem
from models.item_assignments import ItemAssignment
from models.table_participants import TableParticipant
from models.groups import Group
from models.group_members import GroupMember
from schemas.invoices import (
    InvoiceCreate,
    InvoiceUpdate,
    InvoiceResponse,
    InvoiceMarkPaid,
    AvailableGroupsResponse,
)

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.post("", response_model=InvoiceResponse, status_code=201)
def create_invoice(invoice_data: InvoiceCreate, db: SessionDep):
    """Create an invoice after closing a session. Validates that both users are in the selected group."""
    # Validate that both users are in the group
    creditor_member = db.exec(
        select(GroupMember).where(
            GroupMember.group_id == invoice_data.group_id,
            GroupMember.user_id == invoice_data.creditor_id
        )
    ).first()
    
    debtor_member = db.exec(
        select(GroupMember).where(
            GroupMember.group_id == invoice_data.group_id,
            GroupMember.user_id == invoice_data.debtor_id
        )
    ).first()
    
    if not creditor_member:
        raise HTTPException(
            status_code=400,
            detail=f"Creditor user {invoice_data.creditor_id} is not a member of group {invoice_data.group_id}"
        )
    
    if not debtor_member:
        raise HTTPException(
            status_code=400,
            detail=f"Debtor user {invoice_data.debtor_id} is not a member of group {invoice_data.group_id}"
        )
    
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


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: uuid.UUID, db: SessionDep):
    """Get invoice details."""
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.get("", response_model=list[InvoiceResponse])
def list_invoices(
    user_id: Optional[uuid.UUID] = Query(None, description="Filter by user (creditor or debtor)"),
    status: Optional[str] = Query(None, description="Filter by status"),
    group_id: Optional[uuid.UUID] = Query(None, description="Filter by group"),
    db: SessionDep = None
):
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
    
    invoices = db.exec(query).all()
    return invoices


@router.put("/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(invoice_id: uuid.UUID, invoice_data: InvoiceUpdate, db: SessionDep):
    """Update invoice."""
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
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


@router.put("/{invoice_id}/mark-paid", response_model=InvoiceResponse)
def mark_invoice_paid(invoice_id: uuid.UUID, data: InvoiceMarkPaid, db: SessionDep):
    """Mark invoice as paid."""
    from datetime import datetime
    
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice.status = "paid"
    invoice.paid_at = data.paid_at or datetime.now()
    
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    
    return invoice


@router.get("/users/{user_id}/invoices", response_model=list[InvoiceResponse])
def get_user_invoices(user_id: uuid.UUID, db: SessionDep):
    """Get all invoices for a user (as creditor or debtor)."""
    # Get invoices where user is involved through assignments
    # This requires joining through invoice_items -> item_assignments -> table_participants
    query = (
        select(Invoice)
        .join(InvoiceItem, InvoiceItem.invoice_id == Invoice.id)
        .join(ItemAssignment, ItemAssignment.id == InvoiceItem.item_assignment_id)
        .join(TableParticipant, TableParticipant.id == ItemAssignment.creditor_id)
        .where(TableParticipant.user_id == user_id)
    )
    
    invoices = db.exec(query).all()
    
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


@router.get("/users/{user_id}/invoices/pending", response_model=list[InvoiceResponse])
def get_user_pending_invoices(user_id: uuid.UUID, db: SessionDep):
    """Get pending invoices for a user."""
    invoices = get_user_invoices(user_id, db)
    return [inv for inv in invoices if inv.status == "pending"]


@router.get("/available-groups", response_model=AvailableGroupsResponse)
def get_available_groups(
    debtor_id: uuid.UUID = Query(..., description="Debtor user ID"),
    creditor_id: uuid.UUID = Query(..., description="Creditor user ID"),
    db: SessionDep = None
):
    """Get groups where both users are members."""
    # Find groups where both users are members
    # Get groups for debtor
    debtor_groups = db.exec(
        select(GroupMember.group_id).where(GroupMember.user_id == debtor_id)
    ).all()
    
    # Get groups for creditor
    creditor_groups = db.exec(
        select(GroupMember.group_id).where(GroupMember.user_id == creditor_id)
    ).all()
    
    # Find intersection
    common_group_ids = set(debtor_groups) & set(creditor_groups)
    
    if not common_group_ids:
        return AvailableGroupsResponse(groups=[])
    
    # Get group details
    groups = db.exec(
        select(Group).where(Group.id.in_(common_group_ids))
    ).all()
    
    return AvailableGroupsResponse(
        groups=[{"id": str(g.id), "name": g.name, "slug": g.slug} for g in groups]
    )

