import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from api.deps import SessionDep
from models.payment_reminders import PaymentReminder
from models.invoices import Invoice
from schemas.reminders import PaymentReminderCreate, PaymentReminderResponse

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.post("", response_model=PaymentReminderResponse, status_code=201)
def create_reminder(reminder_data: PaymentReminderCreate, db: SessionDep):
    """Create a payment reminder."""
    # Verify invoice exists
    invoice = db.get(Invoice, reminder_data.invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    reminder = PaymentReminder(
        invoice_id=reminder_data.invoice_id,
        send_at=reminder_data.send_at,
        message=reminder_data.message,
        near_to_due_date=reminder_data.near_to_due_date,
        status="pending"
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    
    return reminder


@router.get("/invoices/{invoice_id}/reminders", response_model=list[PaymentReminderResponse])
def get_invoice_reminders(invoice_id: uuid.UUID, db: SessionDep):
    """Get reminders for an invoice."""
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    reminders = db.exec(
        select(PaymentReminder).where(PaymentReminder.invoice_id == invoice_id)
    ).all()
    
    return reminders


@router.get("", response_model=list[PaymentReminderResponse])
def list_reminders(
    invoice_id: Optional[uuid.UUID] = Query(None, description="Filter by invoice"),
    status: Optional[str] = Query(None, description="Filter by status"),
    db: SessionDep = None
):
    """List reminders with optional filters."""
    query = select(PaymentReminder)
    
    if invoice_id:
        query = query.where(PaymentReminder.invoice_id == invoice_id)
    
    if status:
        query = query.where(PaymentReminder.status == status)
    
    reminders = db.exec(query).all()
    return reminders

