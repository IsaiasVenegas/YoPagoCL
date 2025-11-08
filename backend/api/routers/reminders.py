import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from api.deps import SessionDep
from crud import reminders as crud_reminders
from crud import invoices as crud_invoices
from schemas.reminders import PaymentReminderCreate, PaymentReminderResponse

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.post("", response_model=PaymentReminderResponse, status_code=201)
def create_reminder(reminder_data: PaymentReminderCreate, db: SessionDep):
    """Create a payment reminder."""
    # Verify invoice exists
    invoice = crud_invoices.get_invoice_by_id(db, reminder_data.invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    reminder = crud_reminders.create_reminder(db, reminder_data)
    return reminder


@router.get("/invoices/{invoice_id}/reminders", response_model=list[PaymentReminderResponse])
def get_invoice_reminders(invoice_id: uuid.UUID, db: SessionDep):
    """Get reminders for an invoice."""
    invoice = crud_invoices.get_invoice_by_id(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    reminders = crud_reminders.get_invoice_reminders(db, invoice_id)
    return reminders


@router.get("", response_model=list[PaymentReminderResponse])
def list_reminders(
    invoice_id: Optional[uuid.UUID] = Query(None, description="Filter by invoice"),
    status: Optional[str] = Query(None, description="Filter by status"),
    db: SessionDep = None
):
    """List reminders with optional filters."""
    reminders = crud_reminders.list_reminders(db, invoice_id=invoice_id, status=status)
    return reminders

