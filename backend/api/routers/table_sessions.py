import uuid
from fastapi import APIRouter, HTTPException
from sqlmodel import select

from api.deps import SessionDep
from models.table_sessions import TableSession
from models.order_items import OrderItem
from models.table_participants import TableParticipant
from schemas.table_sessions import (
    SessionResponse,
    OrderItemResponse,
    TableParticipantResponse,
    SessionClose,
)

router = APIRouter(prefix="/table_sessions", tags=["table_sessions"])


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(session_id: uuid.UUID, db: SessionDep):
    """Get session information."""
    session = db.get(TableSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/{session_id}/items", response_model=list[OrderItemResponse])
def get_session_items(session_id: uuid.UUID, db: SessionDep):
    """Get order items for a session."""
    session = db.get(TableSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    items = db.exec(
        select(OrderItem).where(OrderItem.session_id == session_id)
    ).all()
    
    return items


@router.get("/{session_id}/participants", response_model=list[TableParticipantResponse])
def get_session_participants(session_id: uuid.UUID, db: SessionDep):
    """Get participants for a session."""
    session = db.get(TableSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    participants = db.exec(
        select(TableParticipant).where(TableParticipant.session_id == session_id)
    ).all()
    
    return participants


@router.put("/{session_id}/close", response_model=SessionResponse)
def close_session(session_id: uuid.UUID, close_data: SessionClose, db: SessionDep):
    """Close a session."""
    from datetime import datetime
    
    session = db.get(TableSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.status = close_data.status
    session.session_end = datetime.now()
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return session

