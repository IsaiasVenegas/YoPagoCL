import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from api.deps import SessionDep
from crud import invoices as crud_invoices
from crud import groups as crud_groups
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
    is_valid, error_message = crud_invoices.validate_users_in_group(
        db, invoice_data.group_id, invoice_data.creditor_id, invoice_data.debtor_id
    )
    
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_message)
    
    invoice = crud_invoices.create_invoice(db, invoice_data)
    return invoice


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: uuid.UUID, db: SessionDep):
    """Get invoice details."""
    invoice = crud_invoices.get_invoice_by_id(db, invoice_id)
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
    invoices = crud_invoices.list_invoices(db, user_id=user_id, status=status, group_id=group_id)
    return invoices


@router.put("/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(invoice_id: uuid.UUID, invoice_data: InvoiceUpdate, db: SessionDep):
    """Update invoice."""
    invoice = crud_invoices.update_invoice(db, invoice_id, invoice_data)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.put("/{invoice_id}/mark-paid", response_model=InvoiceResponse)
def mark_invoice_paid(invoice_id: uuid.UUID, data: InvoiceMarkPaid, db: SessionDep):
    """Mark invoice as paid."""
    invoice = crud_invoices.mark_invoice_paid(db, invoice_id, data.paid_at)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.get("/users/{user_id}/invoices", response_model=list[InvoiceResponse])
def get_user_invoices(user_id: uuid.UUID, db: SessionDep):
    """Get all invoices for a user (as creditor or debtor)."""
    invoices = crud_invoices.get_user_invoices(db, user_id)
    return invoices


@router.get("/users/{user_id}/invoices/pending", response_model=list[InvoiceResponse])
def get_user_pending_invoices(user_id: uuid.UUID, db: SessionDep):
    """Get pending invoices for a user."""
    invoices = crud_invoices.get_user_pending_invoices(db, user_id)
    return invoices


@router.get("/available-groups", response_model=AvailableGroupsResponse)
def get_available_groups(
    debtor_id: uuid.UUID = Query(..., description="Debtor user ID"),
    creditor_id: uuid.UUID = Query(..., description="Creditor user ID"),
    db: SessionDep = None
):
    """Get groups where both users are members."""
    groups = crud_groups.get_common_groups_for_users(db, debtor_id, creditor_id)
    
    return AvailableGroupsResponse(
        groups=[{"id": str(g.id), "name": g.name, "slug": g.slug} for g in groups]
    )

