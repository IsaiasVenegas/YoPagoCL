from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from api.routers import auth, groups, table_sessions, invoices, reminders, websocket, wallets

routes = APIRouter()

# Include all routers
routes.include_router(auth.router)
routes.include_router(groups.router)
routes.include_router(table_sessions.router)
routes.include_router(invoices.router)
routes.include_router(reminders.router)
routes.include_router(wallets.router)

# WebSocket routes
routes.include_router(websocket.router)


@routes.get("/avatars/{filename}")
async def get_avatar(filename: str):
    """Get avatar image file.
    
    Args:
        filename: Avatar filename
    
    Returns:
        Avatar image file
    """
    # Path is relative to the backend directory
    avatars_dir = Path(__file__).parent.parent.parent / "avatars"
    file_path = avatars_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Avatar not found")
    
    return FileResponse(file_path)

