import uuid
import httpx
import time
from typing import Optional
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Query

from api.deps import SessionDep, CurrentUser
from crud import invoices as crud_invoices
from crud import groups as crud_groups
from crud import item_assignments as crud_assignments
from crud import table_participants as crud_participants
from crud import wallets as crud_wallets
from schemas.invoices import (
    InvoiceCreate,
    InvoiceUpdate,
    InvoiceResponse,
    InvoiceMarkPaid,
    AvailableGroupsResponse,
    BillPaymentRequest,
    BillPaymentResponse,
    InvoiceItemCreate,
)

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.post("", response_model=InvoiceResponse, status_code=201)
def create_invoice(invoice_data: InvoiceCreate, db: SessionDep):
    """Create an invoice after closing a session. Validates that both users are in the selected group."""
    # Validate that both users are in the group
    is_valid, error_message = crud_invoices.validate_users_in_group(
        db, invoice_data.group_id, invoice_data.from_user, invoice_data.to_user
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
    from_user: uuid.UUID = Query(..., description="User who pays"),
    to_user: uuid.UUID = Query(..., description="User who receives"),
    db: SessionDep = None
):
    """Get groups where both users are members."""
    groups = crud_groups.get_common_groups_for_users(db, from_user, to_user)
    
    return AvailableGroupsResponse(
        groups=[{"id": str(g.id), "name": g.name, "slug": g.slug} for g in groups]
    )


@router.post("/pay-bill", response_model=BillPaymentResponse)
async def pay_bill(
    payment_data: BillPaymentRequest,
    current_user: CurrentUser,
    db: SessionDep
):
    """Pay bills for a session using wallet balance. Creates invoices and marks them as paid (creating wallet transactions)."""
    import logging
    
    logging.info(f"[Pay Bill] Request received for user: {current_user.id}")
    logging.info(f"[Pay Bill] Amount: {payment_data.amount} centavos")
    
    # Get or create wallet
    wallet = crud_wallets.get_or_create_wallet(db, current_user.id)
    logging.info(f"[Pay Bill] Wallet balance: {wallet.balance} centavos")
    
    # Check if wallet has sufficient balance
    if wallet.balance < payment_data.amount:
        raise HTTPException(
            status_code=400, 
            detail=f"Insufficient wallet balance. Current: {wallet.balance / 100:.2f} {payment_data.currency}, Required: {payment_data.amount / 100:.2f} {payment_data.currency}. Please top up your wallet first."
        )
    
    # Get all assignments for the session
    assignments = crud_assignments.get_assignments_by_session_id(db, payment_data.session_id)
    
    # Filter assignments where current user is the creditor (they selected to pay for these)
    user_participant = crud_participants.get_participant_by_session_and_user(
        db, payment_data.session_id, current_user.id
    )
    if not user_participant:
        raise HTTPException(status_code=404, detail="User is not a participant in this session")
    
    # Get assignments where user is the creditor (they're paying for these items)
    user_assignments = [
        a for a in assignments 
        if a.creditor_id == user_participant.id
    ]
    
    if not user_assignments:
        raise HTTPException(status_code=400, detail="No bills to pay for this user")
    
    logging.info(f"[Pay Bill] Found {len(user_assignments)} assignments for user")
    
    # Group assignments by debtor (if any) - for items where user is paying for others
    # For items where user is paying for themselves (debtor_id is None), we'll create invoices differently
    debtor_assignments = defaultdict(list)
    self_pay_assignments = []
    
    for assignment in user_assignments:
        if assignment.debtor_id is None:
            # User paying for themselves
            self_pay_assignments.append(assignment)
        else:
            # User paying for someone else
            debtor_assignments[assignment.debtor_id].append(assignment)
    
    # Create wallet transaction for the payment (this will also deduct from wallet balance)
    from datetime import datetime
    wallet_transaction = crud_wallets.create_wallet_transaction(
        db=db,
        wallet_id=wallet.id,
        transaction_type="payment_sent",
        amount=-payment_data.amount,  # Negative because money goes out
        currency=payment_data.currency,
        description=f"Payment for session {payment_data.session_id}",
        commit=False  # We'll commit after creating invoices
    )
    # Note: create_wallet_transaction already updates wallet.balance, so we don't need to deduct manually
    
    created_invoices = []
    
    # Create invoices for self-pay items (user paying for themselves)
    # These don't need invoices with creditors/debtors, but we'll create them for record keeping
    if self_pay_assignments:
        total_self_pay = sum(a.assigned_amount for a in self_pay_assignments)
        logging.info(f"[Pay Bill] Self-pay amount: {total_self_pay} centavos")
        # For self-pay, we can skip invoice creation or create a special invoice
        # For now, we'll just log it
    
    # Create invoices for items where user is paying for others
    for debtor_participant_id, debtor_assigns in debtor_assignments.items():
        debtor_participant = crud_participants.get_participant_by_id(db, debtor_participant_id)
        if not debtor_participant or not debtor_participant.user_id:
            continue
        
        debtor_user_id = debtor_participant.user_id
        total_amount = sum(a.assigned_amount for a in debtor_assigns)
        
        # Validate users are in group
        is_valid, error_message = crud_invoices.validate_users_in_group(
            db, payment_data.group_id, current_user.id, debtor_user_id
        )
        if not is_valid:
            logging.warning(f"[Pay Bill] Skipping invoice creation: {error_message}")
            continue
        
        # Create invoice (current_user is from_user, debtor_user_id is to_user)
        invoice_data = InvoiceCreate(
            session_id=payment_data.session_id,
            group_id=payment_data.group_id,
            from_user=current_user.id,
            to_user=debtor_user_id,
            total_amount=total_amount,
            currency=payment_data.currency,
            invoice_items=[InvoiceItemCreate(item_assignment_id=a.id) for a in debtor_assigns]
        )
        
        invoice = crud_invoices.create_invoice(db, invoice_data)
        
        # Mark invoice as paid (this will create wallet transactions)
        crud_invoices.mark_invoice_paid(db, invoice.id, datetime.now())
        
        created_invoices.append(invoice)
        logging.info(f"[Pay Bill] Created invoice {invoice.id} for {total_amount} centavos")
    
    # Commit all changes
    db.commit()
    db.refresh(wallet)
    
    logging.info(f"[Pay Bill] Payment successful. New wallet balance: {wallet.balance} centavos")
    
    # Check if all bills are paid and auto-finalize if so
    try:
        # Get all participants in the session
        all_participants = crud_participants.get_participants_by_session_id(db, payment_data.session_id)
        
        # Get all assignments for the session
        all_assignments = crud_assignments.get_assignments_by_session_id(db, payment_data.session_id)
        
        # Get all invoices for this session
        from models.invoices import Invoice
        from sqlmodel import select
        session_invoices = db.exec(
            select(Invoice)
            .where(Invoice.session_id == payment_data.session_id)
            .where(Invoice.status == "paid")
        ).all()
        
        # Get all participants who have assignments as creditors (they need to pay)
        participants_with_assignments = set()
        for assignment in all_assignments:
            participant = next(
                (p for p in all_participants if p.id == assignment.creditor_id),
                None
            )
            if participant and participant.user_id:
                participants_with_assignments.add(participant.user_id)
        
        # Get all participants who have paid (have paid invoices as from_user)
        participants_who_paid = set()
        for invoice in session_invoices:
            if invoice.from_user:
                participants_who_paid.add(invoice.from_user)
        
        # Check if all participants with assignments have paid
        all_participants_paid = (
            len(participants_with_assignments) > 0 and
            participants_with_assignments.issubset(participants_who_paid)
        )
        
        # If all participants have paid, finalize the session
        if all_participants_paid:
            logging.info(f"[Pay Bill] All bills paid. Auto-finalizing session {payment_data.session_id}")
            
            # Finalize session
            from models.table_sessions import TableSession
            from datetime import datetime
            session = db.get(TableSession, payment_data.session_id)
            if session:
                total_amount = sum(a.assigned_amount for a in all_assignments)
                session.total_amount = total_amount
                session.status = "closed"
                session.session_end = datetime.now()
                db.add(session)
                db.commit()
                
                # Broadcast finalization via WebSocket
                from api.websocket.manager import manager
                from schemas.websocket import SessionFinalizedMessage
                
                broadcast_msg = SessionFinalizedMessage(
                    session_id=payment_data.session_id,
                    total_amount=total_amount,
                    ready_for_invoices=True
                )
                # Broadcast asynchronously (endpoint is already async)
                await manager.broadcast_to_session(
                    broadcast_msg.model_dump(mode='json'),
                    payment_data.session_id
                )
    except Exception as e:
        logging.error(f"[Pay Bill] Error checking if all bills paid: {str(e)}", exc_info=True)
        # Don't fail the payment if auto-finalization fails
    
    return BillPaymentResponse(
        payment_id=f"payment-{uuid.uuid4()}",
        invoices=created_invoices,
        transbank_token=None  # No Transbank token needed for wallet payments
    )

