from fastapi import FastAPI

from core.config import settings
from starlette.middleware.sessions import SessionMiddleware
from authlib.integrations.starlette_client import OAuth, OAuthError

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    client_kwargs={"scope": "openid email profile"},
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
)


app = FastAPI(title="YoPagoCL API", version="0.1.0")

# Session middleware
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)


@app.get("/")
def read_root():
    return {"message": "YoPagoCL API", "version": "0.1.0"}