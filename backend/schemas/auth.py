from pydantic import BaseModel
from uuid import UUID


class AuthorizationUrlResponse(BaseModel):
    """Response with OAuth authorization URL and state."""
    authorization_url: str
    state: str


class TokenResponse(BaseModel):
    """Response with access token and user info."""
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    """User information response."""
    id: UUID
    email: str
    name: str
    phone: str | None = None
    avatar_url: str | None = None

    class Config:
        from_attributes = True


class LoginCallbackRequest(BaseModel):
    """Request to exchange authorization code for token."""
    code: str
    state: str
    redirect_uri: str


class RegisterRequest(BaseModel):
    """Request to register a new user with email and password."""
    email: str
    password: str
    name: str
    phone: str | None = None


class LoginRequest(BaseModel):
    """Request to login with email and password."""
    email: str
    password: str


class UserUpdateRequest(BaseModel):
    """Request to update user information."""
    name: str | None = None
    phone: str | None = None

