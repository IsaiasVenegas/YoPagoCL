from fastapi import APIRouter

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

