from typing import Dict, Set
from fastapi import WebSocket
import uuid


class ConnectionManager:
    """Manages WebSocket connections for table sessions."""
    
    def __init__(self):
        # session_id -> Set[WebSocket]
        self.active_connections: Dict[uuid.UUID, Set[WebSocket]] = {}
        # WebSocket -> session_id
        self.websocket_to_session: Dict[WebSocket, uuid.UUID] = {}
    
    async def connect(self, websocket: WebSocket, session_id: uuid.UUID):
        """Connect a WebSocket to a session."""
        await websocket.accept()
        
        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()
        
        self.active_connections[session_id].add(websocket)
        self.websocket_to_session[websocket] = session_id
    
    def disconnect(self, websocket: WebSocket):
        """Disconnect a WebSocket from a session."""
        if websocket in self.websocket_to_session:
            session_id = self.websocket_to_session[websocket]
            if session_id in self.active_connections:
                self.active_connections[session_id].discard(websocket)
                if not self.active_connections[session_id]:
                    del self.active_connections[session_id]
            del self.websocket_to_session[websocket]
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send a message to a specific WebSocket."""
        await websocket.send_json(message)
    
    async def broadcast_to_session(self, message: dict, session_id: uuid.UUID, exclude: WebSocket = None):
        """Broadcast a message to all connections in a session."""
        if session_id not in self.active_connections:
            print(f"[ConnectionManager] No active connections for session {session_id}")
            return
        
        connections = list(self.active_connections[session_id])
        print(f"[ConnectionManager] Broadcasting to {len(connections)} connections (excluding {1 if exclude else 0})")
        
        disconnected = set()
        for connection in connections:
            if connection == exclude:
                print(f"[ConnectionManager] Skipping excluded connection")
                continue
            try:
                print(f"[ConnectionManager] Sending message to connection: {message}")
                await connection.send_json(message)
                print(f"[ConnectionManager] Message sent successfully")
            except Exception as e:
                print(f"[ConnectionManager] Error sending message: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected connections
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()

