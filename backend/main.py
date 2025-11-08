from fastapi import FastAPI

from core.config import settings
from starlette.middleware.sessions import SessionMiddleware
from api.routers import v1_router


app = FastAPI(title="YoPagoCL API", version="0.1.0")

# Session middleware
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

# API v1 routes
app.include_router(v1_router.routes, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "YoPagoCL API", "version": "0.1.0"}