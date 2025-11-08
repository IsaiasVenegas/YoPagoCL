from fastapi import FastAPI

from core.config import settings
from starlette.middleware.sessions import SessionMiddleware
from api.routers.auth import router as auth_router


app = FastAPI(title="YoPagoCL API", version="0.1.0")

# Session middleware
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

# Routers
app.include_router(auth_router)

@app.get("/")
def read_root():
    return {"message": "YoPagoCL API", "version": "0.1.0"}