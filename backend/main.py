from fastapi import FastAPI

from core.config import settings
from starlette.middleware.sessions import SessionMiddleware
from api.routers import auth, groups, table_sessions, invoices, settlements, reminders, websocket


app = FastAPI(title="YoPagoCL API", version="0.1.0")

# Session middleware
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

# Routers
app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(table_sessions.router)
app.include_router(invoices.router)
app.include_router(settlements.router)
app.include_router(reminders.router)

# WebSocket routes
app.include_router(websocket.router)

@app.get("/")
def read_root():
    return {"message": "YoPagoCL API", "version": "0.1.0"}