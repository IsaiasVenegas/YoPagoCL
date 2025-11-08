import uuid
from fastapi import APIRouter, HTTPException

from api.deps import SessionDep
from schemas.table_sessions import (
    SessionResponse,
    OrderItemResponse,
    TableParticipantResponse,
    SessionClose,
    SessionCreate,
)
from crud.table_sessions import (
    create_session_with_items,
    get_session_by_id,
    get_session_items as get_items_for_session,
    get_session_participants as get_participants_for_session,
    close_session,
)

SESSION_NOT_FOUND = "Session not found"

router = APIRouter(prefix="/table_sessions", tags=["table_sessions"])

@router.post("", response_model=SessionResponse, status_code=201)
def create_session(session_data: SessionCreate, db: SessionDep):
    """Create a new table session."""
    session = create_session_with_items(db, session_data)
    return session


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(session_id: uuid.UUID, db: SessionDep):
    """Get session information."""
    session = get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)
    return session


@router.get("/{session_id}/items", response_model=list[OrderItemResponse])
def get_session_items(session_id: uuid.UUID, db: SessionDep):
    """Get order items for a session."""
    session = get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)
    
    items = get_items_for_session(db, session_id)
    return items


@router.get("/{session_id}/participants", response_model=list[TableParticipantResponse])
def get_session_participants(session_id: uuid.UUID, db: SessionDep):
    """Get participants for a session."""
    session = get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail=SESSION_NOT_FOUND)
    
    participants = get_participants_for_session(db, session_id)
    return participants


@router.put("/{session_id}/close", response_model=SessionResponse)
def close_session_endpoint(session_id: uuid.UUID, close_data: SessionClose, db: SessionDep):
    """Close a session."""
    try:
        session = close_session(db, session_id, close_data)
        return session
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

