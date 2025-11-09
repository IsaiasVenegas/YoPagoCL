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


@router.get("/available-groups", response_model=AvailableGroupsResponse)
def get_available_groups(
    debtor_id: uuid.UUID = Query(..., description="User who pays (debtor)"),
    creditor_id: uuid.UUID = Query(..., description="User who receives (creditor)"),
    db: SessionDep = None
):
    """Get groups where both users are members."""
    # debtor_id is the from_user (who pays), creditor_id is the to_user (who receives)
    groups = crud_groups.get_common_groups_for_users(db, debtor_id, creditor_id)
    
    return AvailableGroupsResponse(
        groups=[{"id": str(g.id), "name": g.name, "slug": g.slug} for g in groups]
    )


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


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: uuid.UUID, db: SessionDep):
    """Get invoice details."""
    invoice = crud_invoices.get_invoice_by_id(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


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


@router.post("/pay-bill", response_model=BillPaymentResponse)
async def pay_bill(
    payment_data: BillPaymentRequest,
    current_user: CurrentUser,
    db: SessionDep
):
    """Pay bills for a session. Creates invoices grouped by creditor:
    1. For each creditor, creates invoice from creditor to restaurant admin (marked as paid with wallet transactions)
    2. For each assignment with a debtor, creates invoice from debtor to creditor (pending)
    """
    import logging
    from datetime import datetime
    from models.table_sessions import TableSession
    from models.restaurants import Restaurant
    
    logging.info(f"[Pay Bill] Request received for user: {current_user.id}")
    logging.info(f"[Pay Bill] Amount: {payment_data.amount} centavos")
    
    # Get session and restaurant
    session = db.get(TableSession, payment_data.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    restaurant = db.get(Restaurant, session.restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    restaurant_admin_id = restaurant.owner
    logging.info(f"[Pay Bill] Restaurant admin: {restaurant_admin_id}")
    
    # Get all assignments for the session
    assignments = crud_assignments.get_assignments_by_session_id(db, payment_data.session_id)
    
    if not assignments:
        raise HTTPException(status_code=400, detail="No assignments found for this session")
    
    logging.info(f"[Pay Bill] Found {len(assignments)} total assignments")
    
    # 1. Agrupa los distintos assignments según acreedor (creditor)
    creditor_assignments = defaultdict(list)
    for assignment in assignments:
        creditor_assignments[assignment.creditor_id].append(assignment)
    
    logging.info(f"[Pay Bill] Grouped into {len(creditor_assignments)} creditor groups")
    
    created_invoices = []
    
    # Process each creditor group
    for creditor_participant_id, creditor_assigns in creditor_assignments.items():
        # Get creditor participant and user
        creditor_participant = crud_participants.get_participant_by_id(db, creditor_participant_id)
        if not creditor_participant or not creditor_participant.user_id:
            logging.warning(f"[Pay Bill] Skipping creditor participant {creditor_participant_id}: no user_id")
            continue
        
        creditor_user_id = creditor_participant.user_id
        total_creditor_amount = sum(a.assigned_amount for a in creditor_assigns)
        
        logging.info(f"[Pay Bill] Processing creditor {creditor_user_id} with {len(creditor_assigns)} assignments, total: {total_creditor_amount} centavos")
        
        # Validate creditor is in group
        is_valid, error_message = crud_invoices.validate_users_in_group(
            db, payment_data.group_id, creditor_user_id, restaurant_admin_id
        )
        if not is_valid:
            logging.warning(f"[Pay Bill] Skipping creditor {creditor_user_id}: {error_message}")
            continue
        
        # 2. Por cada acreedor, crea un invoice donde "from" es el acreedor y "to" es el administrador del restaurant
        invoice_to_admin_data = InvoiceCreate(
            session_id=payment_data.session_id,
            group_id=payment_data.group_id,
            from_user=creditor_user_id,
            to_user=restaurant_admin_id,
            total_amount=total_creditor_amount,
            currency=payment_data.currency,
            invoice_items=[InvoiceItemCreate(item_assignment_id=a.id) for a in creditor_assigns]
        )
        
        invoice_to_admin = crud_invoices.create_invoice(db, invoice_to_admin_data)
        
        # 4. En el caso de los invoices dirigidos al administrador del restaurant, 
        # se deben crear las transacciones wallet correspondientes, y marcar el invoice como "pagado"
        crud_invoices.mark_invoice_paid(db, invoice_to_admin.id, datetime.now())
        created_invoices.append(invoice_to_admin)
        logging.info(f"[Pay Bill] Created and marked as paid invoice {invoice_to_admin.id} from creditor {creditor_user_id} to admin for {total_creditor_amount} centavos")
        
        # 3. Por cada assignment en que exista un deudor, crea un invoice "from" deudor "to" acreedor
        for assignment in creditor_assigns:
            if assignment.debtor_id is not None:
                # Get debtor participant and user
                debtor_participant = crud_participants.get_participant_by_id(db, assignment.debtor_id)
                if not debtor_participant or not debtor_participant.user_id:
                    logging.warning(f"[Pay Bill] Skipping assignment {assignment.id}: debtor participant has no user_id")
                    continue
                
                debtor_user_id = debtor_participant.user_id
                
                # Validate debtor is in group
                is_valid, error_message = crud_invoices.validate_users_in_group(
                    db, payment_data.group_id, debtor_user_id, creditor_user_id
                )
                if not is_valid:
                    logging.warning(f"[Pay Bill] Skipping invoice from debtor {debtor_user_id} to creditor {creditor_user_id}: {error_message}")
                    continue
                
                # Create invoice from debtor to creditor
                invoice_debtor_to_creditor_data = InvoiceCreate(
                    session_id=payment_data.session_id,
                    group_id=payment_data.group_id,
                    from_user=debtor_user_id,
                    to_user=creditor_user_id,
                    total_amount=assignment.assigned_amount,
                    currency=payment_data.currency,
                    invoice_items=[InvoiceItemCreate(item_assignment_id=assignment.id)]
                )
                
                invoice_debtor_to_creditor = crud_invoices.create_invoice(db, invoice_debtor_to_creditor_data)
                # Note: This invoice is NOT marked as paid - it remains pending
                created_invoices.append(invoice_debtor_to_creditor)
                logging.info(f"[Pay Bill] Created pending invoice {invoice_debtor_to_creditor.id} from debtor {debtor_user_id} to creditor {creditor_user_id} for {assignment.assigned_amount} centavos")
    
    # Commit all changes
    db.commit()
    
    logging.info(f"[Pay Bill] Created {len(created_invoices)} invoices total")
    
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

