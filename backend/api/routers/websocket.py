import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlmodel import Session

from api.deps import get_db
from api.websocket.table_sessions import websocket_session_endpoint

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/table_sessions/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: uuid.UUID):
    """WebSocket endpoint for real-time session management."""
    # Get database session
    db_gen = get_db()
    db: Session = next(db_gen)
    
    try:
        await websocket_session_endpoint(websocket, session_id, db)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.close(code=1011, reason=str(e))
    finally:
        db.close()

