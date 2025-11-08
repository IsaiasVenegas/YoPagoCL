import jwt
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from core.config import settings


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    
    now = datetime.now(settings.APP_TIMEZONE)
    if expires_delta:
        expire = now + expires_delta
    else:
        # Default to 7 days
        expire = now + timedelta(days=7)
    
    to_encode.update({"exp": expire, "iat": now})
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT access token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_user_id_from_token(token: str) -> Optional[UUID]:
    """Extract user ID from JWT token."""
    payload = decode_access_token(token)
    if payload and "sub" in payload:
        try:
            return UUID(payload["sub"])
        except (ValueError, TypeError):
            return None
    return None

