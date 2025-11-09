import uuid
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect
from models.table_participants import TableParticipant
from models.order_items import OrderItem
from sqlmodel import Session

from api.websocket.manager import manager
from models.table_sessions import TableSession
from crud.table_participants import (
    get_participants_by_session_id,
    get_participant_by_session_and_user,
    get_participant_by_id,
    create_participant
)
from crud.order_items import (
    get_order_items_by_session_id,
    get_order_item_by_id
)
from crud.item_assignments import (
    get_assignments_by_order_item_id,
    get_assignments_by_session_id,
    get_assignment_by_id,
    create_assignment,
    update_assignment,
    delete_assignment
)
from schemas.websocket import (
    JoinSessionMessage,
    AssignItemMessage,
    GetSelectableParticipantsMessage,
    GetPayingForParticipantsMessage,
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
    SelectableParticipantsMessage,
    PayingForParticipantsMessage,
    UnlockSessionMessage,
    SessionLockedMessage,
    SessionUnlockedMessage,
)

# Track websocket -> participant_id mapping
_websocket_participants: dict[WebSocket, uuid.UUID] = {}


async def _cleanup_participant(websocket: WebSocket, session_id: uuid.UUID):
    """Clean up participant tracking and broadcast leave message."""
    participant_id = _websocket_participants.pop(websocket, None)
    if participant_id:
            broadcast_msg = ParticipantLeftMessage(participant_id=participant_id)
            await manager.broadcast_to_session(
                broadcast_msg.model_dump(mode='json'),
                session_id,
                exclude=websocket
            )


async def _handle_message(websocket: WebSocket, session_id: uuid.UUID, data: dict, db: Session):
    """Route incoming message to appropriate handler."""
    message_type = data.get("type")
    print(f"[WebSocket] Received message type: {message_type}, data: {data}")
    
    handlers = {
        "join_session": lambda: handle_join_session(websocket, session_id, data, db),
        "get_selectable_participants": lambda: handle_get_selectable_participants(websocket, session_id, data, db),
        "get_paying_for_participants": lambda: handle_get_paying_for_participants(websocket, session_id, data, db),
        "assign_item": lambda: handle_assign_item(websocket, session_id, data, db),
        "remove_assignment": lambda: handle_remove_assignment(websocket, session_id, data, db),
        "calculate_equal_split": lambda: handle_calculate_equal_split(websocket, session_id, db),
        "request_summary": lambda: handle_request_summary(websocket, session_id, db),
        "validate_assignments": lambda: handle_validate_assignments(websocket, session_id, db),
        "unlock_session": lambda: handle_unlock_session(websocket, session_id, db),
        "finalize_session": lambda: handle_finalize_session(websocket, session_id, db),
    }
    
    handler = handlers.get(message_type)
    if handler:
        await handler()
    else:
        print(f"[WebSocket] Unknown message type: {message_type}")
        await websocket.send_json({
            "type": "error",
            "message": f"Unknown message type: {message_type}"
        })


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
            await _handle_message(websocket, session_id, data, db)
    
    except WebSocketDisconnect:
        await _cleanup_participant(websocket, session_id)
        manager.disconnect(websocket)
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": str(e)
        })
        await _cleanup_participant(websocket, session_id)
        manager.disconnect(websocket)


async def send_session_state(websocket: WebSocket, session_id: uuid.UUID, db: Session):
    """Send complete session state to a client."""
    from models.users import User
    
    session = db.get(TableSession, session_id)
    if not session:
        return
    
    participants = get_participants_by_session_id(db, session_id)
    
    # Load user information for participants
    participant_data = []
    for p in participants:
        participant_dict = {
            "id": str(p.id),
            "user_id": str(p.user_id) if p.user_id else None,
            "joined_at": p.joined_at.isoformat()
        }
        # If participant has a user_id, load user information
        if p.user_id:
            user = db.get(User, p.user_id)
            if user:
                participant_dict["user_name"] = user.name
                participant_dict["user_avatar_url"] = user.avatar_url
        participant_data.append(participant_dict)
    
    order_items = get_order_items_by_session_id(db, session_id)
    
    assignments = get_assignments_by_session_id(db, session_id)
    
    message = SessionStateMessage(
        session={
            "id": str(session.id),
            "status": session.status,
            "total_amount": session.total_amount,
            "currency": session.currency,
            "locked": session.locked,
            "locked_by_user_id": str(session.locked_by_user_id) if session.locked_by_user_id else None
        },
        participants=participant_data,
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
    
    await websocket.send_json(message.model_dump(mode='json'))


async def handle_join_session(websocket: WebSocket, session_id: uuid.UUID, data: dict, db: Session):
    """Handle join_session message."""
    try:
        msg = JoinSessionMessage(**data)
        
        # Check if participant already exists
        existing = get_participant_by_session_and_user(db, session_id, msg.user_id)
        
        if not existing:
            from models.users import User
            
            participant = create_participant(db, session_id, msg.user_id)
            
            # Track this websocket -> participant mapping
            _websocket_participants[websocket] = participant.id
            
            # Send updated session state to the joining client
            await send_session_state(websocket, session_id, db)
            
            # Load user information for broadcast message
            user_name = None
            user_avatar_url = None
            if participant.user_id:
                user = db.get(User, participant.user_id)
                if user:
                    user_name = user.name
                    user_avatar_url = user.avatar_url
            
            # Broadcast to others
            broadcast_msg = ParticipantJoinedMessage(
                participant_id=participant.id,
                user_id=participant.user_id,
                joined_at=participant.joined_at.isoformat(),
                user_name=user_name,
                user_avatar_url=user_avatar_url
            )
            broadcast_data = broadcast_msg.model_dump(mode='json')
            print(f"[WebSocket] Broadcasting participant_joined: {broadcast_data}")
            print(f"[WebSocket] Active connections for session {session_id}: {len(manager.active_connections.get(session_id, set()))}")
            await manager.broadcast_to_session(
                broadcast_data,
                session_id,
                exclude=websocket
            )
            print(f"[WebSocket] participant_joined broadcast completed")
        else:
            # Track existing participant for this websocket
            _websocket_participants[websocket] = existing.id
            # Send updated session state to the client
            await send_session_state(websocket, session_id, db)
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to join session: {str(e)}"
        })

def _validate_order_item_belongs_to_session(order_item: OrderItem, session_id: uuid.UUID) -> tuple[bool, str | None]:
    """
    Validate that an assignment exists and belongs to the session.
    Returns (is_valid, error_message).
    """
    if not order_item or order_item.session_id != session_id:
        return False, "Order item not found or doesn't belong to this session"
    return True, None


def _get_new_amount_per_assignment(order_item: OrderItem, db: Session, negative_adjustment: bool = False) -> int:
    """Get the new assignment amount for an order item."""
    total_amount = order_item.unit_price
    assignments = get_assignments_by_order_item_id(db, order_item.id)
    current_number_of_assignments = len(assignments)
    new_number_of_assignments = current_number_of_assignments + (-1 if negative_adjustment else 1)
    if new_number_of_assignments == 0:
        return total_amount
    new_amount_per_person = total_amount // new_number_of_assignments
    return new_amount_per_person


async def handle_get_selectable_participants(websocket: WebSocket, session_id: uuid.UUID, data: dict, db: Session) -> list[TableParticipant]:
    """
    Get the participants that can be selected as debtors for a given order item.
    If the user is already a debtor, they cannot be selected as a debtor again.
    If the user is already a creditor, they cannot be selected as a debtor.
    The user that asks for the selectable participants cannot be selected as a debtor.
    """
    msg = GetSelectableParticipantsMessage(**data)
    participants = get_participants_by_session_id(db, session_id)
    assignments = get_assignments_by_order_item_id(db, msg.order_item_id)
    
    # Get the current user's participant_id to exclude them
    current_user_participant = get_participant_by_session_and_user(db, session_id, msg.user_id)
    current_user_participant_id = current_user_participant.id if current_user_participant else None
    
    # Exclude participant_ids that are already creditors or debtors
    excluded_participant_ids = {
        assignment.creditor_id for assignment in assignments
    } | {
        assignment.debtor_id for assignment in assignments if assignment.debtor_id
    }
    
    # Also exclude the current user's participant_id
    if current_user_participant_id:
        excluded_participant_ids.add(current_user_participant_id)
    
    # Filter participants and return their user_ids as strings
    selectable_participants = [
        str(participant.user_id) 
        for participant in participants 
        if participant.id not in excluded_participant_ids and participant.user_id is not None
    ]
    
    # Send the selectable participants to the user that asked for them
    personal_message = SelectableParticipantsMessage(
        order_item_id=msg.order_item_id,
        selectable_participants=selectable_participants,
    )
    await manager.send_personal_message(personal_message.model_dump(mode='json'), websocket)


async def handle_get_paying_for_participants(websocket: WebSocket, session_id: uuid.UUID, data: dict, db: Session):
    """
    Get the participants that the current user is currently paying for in a specific order item.
    Returns a list of user_ids of participants where the current user is the creditor
    and there is a debtor assigned for the given order_item_id.
    """
    msg = GetPayingForParticipantsMessage(**data)
    
    # Get the current user's participant_id
    current_user_participant = get_participant_by_session_and_user(db, session_id, msg.user_id)
    if not current_user_participant:
        # If user is not a participant, return empty list
        personal_message = PayingForParticipantsMessage(
            order_item_id=msg.order_item_id,
            paying_for_participants=[]
        )
        await manager.send_personal_message(personal_message.model_dump(mode='json'), websocket)
        return
    
    # Get all assignments for this specific order item
    assignments = get_assignments_by_order_item_id(db, msg.order_item_id)
    
    # Find assignments where current user is the creditor and there is a debtor
    paying_for_debtor_ids = set()
    for assignment in assignments:
        if assignment.creditor_id == current_user_participant.id and assignment.debtor_id is not None:
            paying_for_debtor_ids.add(assignment.debtor_id)
    
    # Get the participants for these debtor_ids and extract their user_ids
    paying_for_participants = []
    for debtor_id in paying_for_debtor_ids:
        participant = get_participant_by_id(db, debtor_id)
        if participant and participant.user_id is not None:
            paying_for_participants.append(str(participant.user_id))
    
    # Send the participants that the user is paying for
    personal_message = PayingForParticipantsMessage(
        order_item_id=msg.order_item_id,
        paying_for_participants=paying_for_participants,
    )
    await manager.send_personal_message(personal_message.model_dump(mode='json'), websocket)

async def handle_assign_item(websocket: WebSocket, session_id: uuid.UUID, data: dict, db: Session):
    """Handle assign_item message."""
    print(f"[WebSocket] handle_assign_item called with data: {data}")
    try:
        # Check if session is locked
        session = db.get(TableSession, session_id)
        if session and session.locked:
            await websocket.send_json({
                "type": "error",
                "message": "Session is locked. Assignments cannot be modified."
            })
            return
        
        msg = AssignItemMessage(**data)
        print(f"[WebSocket] Parsed message: order_item_id={msg.order_item_id}, creditor_id={msg.creditor_id}, assigned_amount={msg.assigned_amount}")
        
        # Verify order item belongs to session
        order_item = get_order_item_by_id(db, msg.order_item_id)
        belongs_to_session, error_msg = _validate_order_item_belongs_to_session(order_item, session_id)
        if not belongs_to_session:
            await websocket.send_json({
                "type": "error",
                "message": error_msg
            })
            return
        
        # Verify participants exist
        creditor = get_participant_by_id(db, msg.creditor_id)
        if not creditor or creditor.session_id != session_id:
            await websocket.send_json({
                "type": "error",
                "message": "Creditor participant not found"
            })
            return
        
        if msg.debtor_id:
            debtor = get_participant_by_id(db, msg.debtor_id)
            if not debtor or debtor.session_id != session_id:
                await websocket.send_json({
                    "type": "error",
                    "message": "Debtor participant not found"
                })
                return

        # Validate that the creditor is not present as a debtor in the list of assignments for the same order item
        assignments = get_assignments_by_order_item_id(db, order_item.id)
        for assignment in assignments:
            if assignment.debtor_id == msg.creditor_id:
                # Save assignment_id before deleting
                assignment_id_to_remove = assignment.id
                delete_assignment(db, assignment_id_to_remove)
                # Broadcast to all (including sender so they get the update too)
                broadcast_msg = AssignmentRemovedMessage(assignment_id=assignment_id_to_remove)
                # Use model_dump with mode='json' to ensure UUIDs are serialized as strings
                broadcast_data = broadcast_msg.model_dump(mode='json')
                print(f"[WebSocket] Broadcasting assignment_removed: {broadcast_data}")
                print(f"[WebSocket] Active connections for session {session_id}: {len(manager.active_connections.get(session_id, set()))}")
                await manager.broadcast_to_session(
                    broadcast_data,
                    session_id,
                    exclude=None  # Include sender so they get the update too
                )

        new_assignment_amount_per_person = _get_new_amount_per_assignment(order_item, db)
        
        assignment = create_assignment(
            db,
            msg.order_item_id,
            msg.creditor_id,
            msg.debtor_id,
            new_assignment_amount_per_person
        )

        # Update all assignments on the same order item
        assignments = get_assignments_by_order_item_id(db, order_item.id)
        for assignment in assignments:
            update_assignment(db, assignment.id, new_assignment_amount_per_person)
            # Broadcast to all
            broadcast_msg = AssignmentUpdatedMessage(
                assignment_id=assignment.id,
                assigned_amount=assignment.assigned_amount
            )
            await manager.broadcast_to_session(
                broadcast_msg.model_dump(mode='json'),
                session_id
            )

        # Broadcast the new assignment to all
        broadcast_msg = ItemAssignedMessage(
            assignment_id=assignment.id,
            order_item_id=assignment.order_item_id,
            creditor_id=assignment.creditor_id,
            debtor_id=assignment.debtor_id,
            assigned_amount=assignment.assigned_amount
        )
        await manager.broadcast_to_session(
            broadcast_msg.model_dump(mode='json'),
            session_id
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to assign item: {str(e)}"
        })


async def handle_remove_assignment(websocket: WebSocket, session_id: uuid.UUID, data: dict, db: Session):
    """Handle remove_assignment message."""
    try:
        # Check if session is locked
        session = db.get(TableSession, session_id)
        if session and session.locked:
            await websocket.send_json({
                "type": "error",
                "message": "Session is locked. Assignments cannot be modified."
            })
            return
        
        msg = RemoveAssignmentMessage(**data)
        
        assignment = get_assignment_by_id(db, msg.assignment_id)
        if not assignment:
            await websocket.send_json({
                "type": "error",
                "message": "Assignment not found"
            })
            return
        
        # Verify assignment belongs to session
        order_item = get_order_item_by_id(db, assignment.order_item_id)
        belongs_to_session, error_msg = _validate_order_item_belongs_to_session(order_item, session_id)
        if not belongs_to_session:
            await websocket.send_json({
                "type": "error",
                "message": error_msg
            })
            return
        
        # Calculate before deleting the assignment to prevent division by zero
        new_assignment_amount_per_person = _get_new_amount_per_assignment(order_item, db, True)

        delete_assignment(db, msg.assignment_id)
        print(f"[WebSocket] Assignment {msg.assignment_id} deleted from database")

        # Update all assignments on the same order item
        assignments = get_assignments_by_order_item_id(db, order_item.id)
        for assignment in assignments:
            update_assignment(db, assignment.id, new_assignment_amount_per_person)
            # Broadcast to all
            broadcast_msg = AssignmentUpdatedMessage(
                assignment_id=assignment.id,
                assigned_amount=assignment.assigned_amount
            )
            await manager.broadcast_to_session(
                broadcast_msg.model_dump(mode='json'),
                session_id
            )

        # Broadcast to all (including sender so they get the update too)
        broadcast_msg = AssignmentRemovedMessage(assignment_id=msg.assignment_id)
        # Use model_dump with mode='json' to ensure UUIDs are serialized as strings
        broadcast_data = broadcast_msg.model_dump(mode='json')
        print(f"[WebSocket] Broadcasting assignment_removed: {broadcast_data}")
        print(f"[WebSocket] Active connections for session {session_id}: {len(manager.active_connections.get(session_id, set()))}")
        await manager.broadcast_to_session(
            broadcast_data,
            session_id,
            exclude=None  # Include sender so they get the update
        )
        print(f"[WebSocket] assignment_removed broadcast completed")
    
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
            order_items = get_order_items_by_session_id(db, session_id)
            total = sum(item.unit_price for item in order_items)
        
        # Get participant count
        participants = get_participants_by_session_id(db, session_id)
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
            broadcast_msg.model_dump(mode='json'),
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
        assignments = get_assignments_by_session_id(db, session_id)
        
        summary = {}
        for assignment in assignments:
            creditor_id = str(assignment.creditor_id)
            if creditor_id not in summary:
                summary[creditor_id] = 0
            summary[creditor_id] += assignment.assigned_amount
        
        # Send to the user that requested the summary
        personal_msg = SummaryUpdatedMessage(summary=summary)
        await manager.send_personal_message(
            personal_msg.model_dump(mode='json'),
            websocket
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to calculate summary: {str(e)}"
        })


async def handle_validate_assignments(websocket: WebSocket, session_id: uuid.UUID, db: Session):
    """Handle validate_assignments message."""
    try:
        # Get session
        session = db.get(TableSession, session_id)
        if not session:
            await websocket.send_json({
                "type": "error",
                "message": "Session not found"
            })
            return
        
        # Get user_id from websocket participant
        participant_id = _websocket_participants.get(websocket)
        if not participant_id:
            await websocket.send_json({
                "type": "error",
                "message": "User not found in session"
            })
            return
        
        participant = get_participant_by_id(db, participant_id)
        if not participant or not participant.user_id:
            await websocket.send_json({
                "type": "error",
                "message": "Participant user not found"
            })
            return
        
        user_id = participant.user_id
        
        # Get all order items
        order_items = get_order_items_by_session_id(db, session_id)
        
        # Get all assignments
        assignments = get_assignments_by_session_id(db, session_id)
        
        # Check which items are fully assigned
        assigned_items = {a.order_item_id for a in assignments}
        total_assigned = sum(a.assigned_amount for a in assignments)
        total_items = sum(item.unit_price for item in order_items)
        
        unassigned_items = [
            str(item.id) for item in order_items
            if item.id not in assigned_items
        ]
        
        all_assigned = len(unassigned_items) == 0 and total_assigned >= total_items
        
        # Lock the session
        session.locked = True
        session.locked_by_user_id = user_id
        db.add(session)
        db.commit()
        
        # Broadcast validation result
        broadcast_msg = AssignmentsValidatedMessage(
            all_assigned=all_assigned,
            unassigned_items=unassigned_items
        )
        await manager.broadcast_to_session(
            broadcast_msg.model_dump(mode='json'),
            session_id
        )
        
        # Broadcast lock message
        lock_msg = SessionLockedMessage(locked_by_user_id=user_id)
        await manager.broadcast_to_session(
            lock_msg.model_dump(mode='json'),
            session_id
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to validate assignments: {str(e)}"
        })


async def handle_unlock_session(websocket: WebSocket, session_id: uuid.UUID, db: Session):
    """Handle unlock_session message."""
    try:
        # Get session
        session = db.get(TableSession, session_id)
        if not session:
            await websocket.send_json({
                "type": "error",
                "message": "Session not found"
            })
            return
        
        # Check if session is locked
        if not session.locked:
            await websocket.send_json({
                "type": "error",
                "message": "Session is not locked"
            })
            return
        
        # Get user_id from websocket participant
        participant_id = _websocket_participants.get(websocket)
        if not participant_id:
            await websocket.send_json({
                "type": "error",
                "message": "User not found in session"
            })
            return
        
        participant = get_participant_by_id(db, participant_id)
        if not participant or not participant.user_id:
            await websocket.send_json({
                "type": "error",
                "message": "Participant user not found"
            })
            return
        
        user_id = participant.user_id
        
        # Check if this user is the one who locked it
        if session.locked_by_user_id != user_id:
            await websocket.send_json({
                "type": "error",
                "message": "Only the user who locked the session can unlock it"
            })
            return
        
        # Unlock the session
        session.locked = False
        session.locked_by_user_id = None
        db.add(session)
        db.commit()
        
        # Broadcast unlock message
        unlock_msg = SessionUnlockedMessage()
        await manager.broadcast_to_session(
            unlock_msg.model_dump(mode='json'),
            session_id
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to unlock session: {str(e)}"
        })


async def handle_finalize_session(websocket: WebSocket, session_id: uuid.UUID, db: Session):
    """Handle finalize_session message."""
    try:
        session = db.get(TableSession, session_id)
        if not session:
            return
        
        # Calculate total from assignments
        assignments = get_assignments_by_session_id(db, session_id)
        
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
            broadcast_msg.model_dump(mode='json'),
            session_id
        )
    
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to finalize session: {str(e)}"
        })

