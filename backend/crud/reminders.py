import uuid
from typing import Optional
from sqlmodel import select, Session
from models.payment_reminders import PaymentReminder
from schemas.reminders import PaymentReminderCreate


def create_reminder(
    db: Session,
    reminder_data: PaymentReminderCreate
) -> PaymentReminder:
    """Create a payment reminder."""
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


def get_invoice_reminders(
    db: Session,
    invoice_id: uuid.UUID
) -> list[PaymentReminder]:
    """Get reminders for an invoice."""
    return db.exec(
        select(PaymentReminder).where(PaymentReminder.invoice_id == invoice_id)
    ).all()


def list_reminders(
    db: Session,
    invoice_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None
) -> list[PaymentReminder]:
    """List reminders with optional filters."""
    query = select(PaymentReminder)
    
    if invoice_id:
        query = query.where(PaymentReminder.invoice_id == invoice_id)
    
    if status:
        query = query.where(PaymentReminder.status == status)
    
    return db.exec(query).all()

