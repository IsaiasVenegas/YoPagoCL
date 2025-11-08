import uuid
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect, HTTPException
from sqlmodel import Session, select

from api.websocket.manager import manager
from models.table_sessions import TableSession
from models.table_participants import TableParticipant
from models.order_items import OrderItem
from models.item_assignments import ItemAssignment
from schemas.websocket import (
    JoinSessionMessage,
    AssignItemMessage,
    UpdateAssignmentMessage,
    RemoveAssignmentMessage,
    ParticipantJoinedMessage,
    ParticipantLeftMessage,
    ItemAssignedMessage,
    AssignmentUpdatedMessage,
    AssignmentRemovedMessage,
    EqualSplitCalculatedMessage,
    SummaryUpdatedMessage,
    AssignmentsValidatedMessage,
    SessionFinalizedMessage,
    SessionStateMessage,
)

# Track websocket -> participant_id mapping
_websocket_participants: dict[WebSocket, uuid.UUID] = {}


async def websocket_session_endpoint(websocket: WebSocket, session_id: uuid.UUID, db: Session):
    """WebSocket endpoint for real-time session management."""
    await manager.connect(websocket, session_id)
    
    # Verify session exists
    session = db.get(TableSession, session_id)
    if not session:
        await websocket.close(code=1008, reason="Session not found")
        return
    
    try:
        # Send initial session state
        await send_session_state(websocket, session_id, db)
        
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "join_session":
                await handle_join_session(websocket, session_id, data, db)
            
            elif message_type == "assign_item":
                await handle_assign_item(websocket, session_id, data, db)
            
            elif message_type == "update_assignment":
                await handle_update_assignment(websocket, session_id, data, db)
            
            elif message_type == "remove_assignment":
                await handle_remove_assignment(websocket, session_id, data, db)
            
            elif message_type == "calculate_equal_split":
                await handle_calculate_equal_split(websocket, session_id, db)
            
            elif message_type == "request_summary":
                await handle_request_summary(websocket, session_id, db)
            
            elif message_type == "validate_assignments":
                await handle_validate_assignments(websocket, session_id, db)
            
            elif message_type == "finalize_session":
                await handle_finalize_session(websocket, session_id, db)
            
            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                })
    
    except WebSocketDisconnect:
        # Identify which participant left
        participant_id = _websocket_participants.get(websocket)
        if participant_id:
            # Broadcast to others that participant left
            broadcast_msg = ParticipantLeftMessage(participant_id=participant_id)
            await manager.broadcast_to_session(
                broadcast_msg.model_dump(),
                session_id,
                exclude=websocket
            )
            # Remove from tracking
            del _websocket_participants[websocket]
        
        manager.disconnect(websocket)
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": str(e)
        })
        
        # Clean up participant tracking if websocket was tracked
        participant_id = _websocket_participants.pop(websocket, None)
        if participant_id:
            # Broadcast to others that participant left
            broadcast_msg = ParticipantLeftMessage(participant_id=participant_id)
            await manager.broadcast_to_session(
                broadcast_msg.model_dump(),
                session_id,
                exclude=websocket
            )
        
        manager.disconnect(websocket)


async def send_session_state(websocket: WebSocket, session_id: uuid.UUID, db: Session):
    """Send complete session state to a client."""
    session = db.get(TableSession, session_id)
    if not session:
        return
    
    participants = db.exec(
        select(TableParticipant).where(TableParticipant.session_id == session_id)
    ).all()
    
    order_items = db.exec(
        select(OrderItem).where(OrderItem.session_id == session_id)
    ).all()
    
    assignments = db.exec(
        select(ItemAssignment)
        .join(OrderItem, OrderItem.id == ItemAssignment.order_item_id)
        .where(OrderItem.session_id == session_id)
    ).all()
    
    message = SessionStateMessage(
        session={
            "id": str(session.id),
            "status": session.status,
            "total_amount": session.total_amount,
            "currency": session.currency
        },
        participants=[{
            "id": str(p.id),
            "user_id": str(p.user_id) if p.user_id else None,
            "joined_at": p.joined_at.isoformat()
        } for p in participants],
        order_items=[{
            "id": str(item.id),
            "item_name": item.item_name,
            "unit_price": item.unit_price,
            "ordered_at": item.ordered_at.isoformat()
        } for item in order_items],
        assignments=[{
            "id": str(a.id),
            "order_item_id": str(a.order_item_id),
            "creditor_id": str(a.creditor_id),
            "debtor_id": str(a.debtor_id) if a.debtor_id else None,
            "assigned_amount": a.assigned_amount
        } for a in assignments]
    )
    
    await websocket.send_json(message.model_dump())


async def handle_join_session(websocket: WebSocket, session_id: uuid.UUID, data: dict, db: Session):
    """Handle join_session message."""
    try:
        msg = JoinSessionMessage(**data)
        
        # Check if participant already exists
        existing = db.exec(
            select(TableParticipant).where(
                TableParticipant.session_id == session_id,
                TableParticipant.user_id == msg.user_id
            )
        ).first()
        
        if not existing:
            participant = TableParticipant(
                session_id=session_id,
                user_id=msg.user_id
            )
            db.add(participant)
            db.commit()
            db.refresh(participant)
            
            # Track this websocket -> participant mapping
            _websocket_participants[websocket] = participant.id
            
            # Broadcast to others
            broadcast_msg = ParticipantJoinedMessage(
                participant_id=participant.id,
                user_id=participant.user_id,
                joined_at=participant.joined_at.isoformat()
            )
            await manager.broadcast_to_session(
                broadcast_msg.model_dump(),
                session_id,
                exclude=websocket
            )
        else:
            # Track existing participant for this websocket
            _websocket_participants[websocket] = existing.id
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to join session: {str(e)}"
        })


async def handle_assign_item(websocket: WebSocket, session_id: uuid.UUID, data: dict, db: Session):
    """Handle assign_item message."""
    try:
        msg = AssignItemMessage(**data)
        
        # Verify order item belongs to session
        order_item = db.get(OrderItem, msg.order_item_id)
        if not order_item or order_item.session_id != session_id:
            await websocket.send_json({
                "type": "error",
                "message": "Order item not found or doesn't belong to this session"
            })
            return
        
        # Verify participants exist
        creditor = db.get(TableParticipant, msg.creditor_id)
        if not creditor or creditor.session_id != session_id:
            await websocket.send_json({
                "type": "error",
                "message": "Creditor participant not found"
            })
            return
        
        if msg.debtor_id:
            debtor = db.get(TableParticipant, msg.debtor_id)
            if not debtor or debtor.session_id != session_id:
                await websocket.send_json({
                    "type": "error",
                    "message": "Debtor participant not found"
                })
                return
        
        assignment = ItemAssignment(
            order_item_id=msg.order_item_id,
            creditor_id=msg.creditor_id,
            debtor_id=msg.debtor_id,
            assigned_amount=msg.assigned_amount
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        
        # Broadcast to all
        broadcast_msg = ItemAssignedMessage(
            assignment_id=assignment.id,
            order_item_id=assignment.order_item_id,
            creditor_id=assignment.creditor_id,
            debtor_id=assignment.debtor_id,
            assigned_amount=assignment.assigned_amount
        )
        await manager.broadcast_to_session(
            broadcast_msg.model_dump(),
            session_id
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to assign item: {str(e)}"
        })


async def handle_update_assignment(websocket: WebSocket, session_id: uuid.UUID, data: dict, db: Session):
    """Handle update_assignment message."""
    try:
        msg = UpdateAssignmentMessage(**data)
        
        assignment = db.get(ItemAssignment, msg.assignment_id)
        if not assignment:
            await websocket.send_json({
                "type": "error",
                "message": "Assignment not found"
            })
            return
        
        # Verify assignment belongs to session
        order_item = db.get(OrderItem, assignment.order_item_id)
        if not order_item or order_item.session_id != session_id:
            await websocket.send_json({
                "type": "error",
                "message": "Assignment doesn't belong to this session"
            })
            return
        
        assignment.assigned_amount = msg.assigned_amount
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        
        # Broadcast to all
        broadcast_msg = AssignmentUpdatedMessage(
            assignment_id=assignment.id,
            assigned_amount=assignment.assigned_amount
        )
        await manager.broadcast_to_session(
            broadcast_msg.model_dump(),
            session_id
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to update assignment: {str(e)}"
        })


async def handle_remove_assignment(websocket: WebSocket, session_id: uuid.UUID, data: dict, db: Session):
    """Handle remove_assignment message."""
    try:
        msg = RemoveAssignmentMessage(**data)
        
        assignment = db.get(ItemAssignment, msg.assignment_id)
        if not assignment:
            await websocket.send_json({
                "type": "error",
                "message": "Assignment not found"
            })
            return
        
        # Verify assignment belongs to session
        order_item = db.get(OrderItem, assignment.order_item_id)
        if not order_item or order_item.session_id != session_id:
            await websocket.send_json({
                "type": "error",
                "message": "Assignment doesn't belong to this session"
            })
            return
        
        db.delete(assignment)
        db.commit()
        
        # Broadcast to all
        broadcast_msg = AssignmentRemovedMessage(assignment_id=msg.assignment_id)
        await manager.broadcast_to_session(
            broadcast_msg.model_dump(),
            session_id
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to remove assignment: {str(e)}"
        })


async def handle_calculate_equal_split(websocket: WebSocket, session_id: uuid.UUID, db: Session):
    """Handle calculate_equal_split message."""
    try:
        session = db.get(TableSession, session_id)
        if not session:
            return
        
        # Get total amount
        total = session.total_amount or 0
        if total == 0:
            # Calculate from order items
            order_items = db.exec(
                select(OrderItem).where(OrderItem.session_id == session_id)
            ).all()
            total = sum(item.unit_price for item in order_items)
        
        # Get participant count
        participants = db.exec(
            select(TableParticipant).where(TableParticipant.session_id == session_id)
        ).all()
        participant_count = len(participants)
        
        if participant_count == 0:
            await websocket.send_json({
                "type": "error",
                "message": "No participants in session"
            })
            return
        
        amount_per_person = total // participant_count
        
        # Broadcast to all
        broadcast_msg = EqualSplitCalculatedMessage(
            total_amount=total,
            participant_count=participant_count,
            amount_per_person=amount_per_person
        )
        await manager.broadcast_to_session(
            broadcast_msg.model_dump(),
            session_id
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to calculate equal split: {str(e)}"
        })


async def handle_request_summary(websocket: WebSocket, session_id: uuid.UUID, db: Session):
    """Handle request_summary message."""
    try:
        # Calculate summary: participant_id -> total_amount
        assignments = db.exec(
            select(ItemAssignment)
            .join(OrderItem, OrderItem.id == ItemAssignment.order_item_id)
            .where(OrderItem.session_id == session_id)
        ).all()
        
        summary = {}
        for assignment in assignments:
            creditor_id = str(assignment.creditor_id)
            if creditor_id not in summary:
                summary[creditor_id] = 0
            summary[creditor_id] += assignment.assigned_amount
        
        # Broadcast to all
        broadcast_msg = SummaryUpdatedMessage(summary=summary)
        await manager.broadcast_to_session(
            broadcast_msg.model_dump(),
            session_id
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to calculate summary: {str(e)}"
        })


async def handle_validate_assignments(websocket: WebSocket, session_id: uuid.UUID, db: Session):
    """Handle validate_assignments message."""
    try:
        # Get all order items
        order_items = db.exec(
            select(OrderItem).where(OrderItem.session_id == session_id)
        ).all()
        
        # Get all assignments
        assignments = db.exec(
            select(ItemAssignment)
            .join(OrderItem, OrderItem.id == ItemAssignment.order_item_id)
            .where(OrderItem.session_id == session_id)
        ).all()
        
        # Check which items are fully assigned
        assigned_items = {a.order_item_id for a in assignments}
        total_assigned = sum(a.assigned_amount for a in assignments)
        total_items = sum(item.unit_price for item in order_items)
        
        unassigned_items = [
            str(item.id) for item in order_items
            if item.id not in assigned_items
        ]
        
        all_assigned = len(unassigned_items) == 0 and total_assigned >= total_items
        
        # Broadcast to all
        broadcast_msg = AssignmentsValidatedMessage(
            all_assigned=all_assigned,
            unassigned_items=unassigned_items
        )
        await manager.broadcast_to_session(
            broadcast_msg.model_dump(),
            session_id
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to validate assignments: {str(e)}"
        })


async def handle_finalize_session(websocket: WebSocket, session_id: uuid.UUID, db: Session):
    """Handle finalize_session message."""
    try:
        session = db.get(TableSession, session_id)
        if not session:
            return
        
        # Calculate total from assignments
        assignments = db.exec(
            select(ItemAssignment)
            .join(OrderItem, OrderItem.id == ItemAssignment.order_item_id)
            .where(OrderItem.session_id == session_id)
        ).all()
        
        total_amount = sum(a.assigned_amount for a in assignments)
        
        session.total_amount = total_amount
        session.status = "closed"
        session.session_end = datetime.now()
        db.add(session)
        db.commit()
        
        # Broadcast to all
        broadcast_msg = SessionFinalizedMessage(
            session_id=session_id,
            total_amount=total_amount,
            ready_for_invoices=True
        )
        await manager.broadcast_to_session(
            broadcast_msg.model_dump(),
            session_id
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to finalize session: {str(e)}"
        })

