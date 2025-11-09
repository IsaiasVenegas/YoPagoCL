import secrets
import hashlib
import base64
import httpx
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from authlib.integrations.starlette_client import OAuthError
from urllib.parse import urlencode

from api.deps import SessionDep, CurrentUser
from crud.auth import get_or_create_user_from_oauth, create_user_with_password, authenticate_user, update_user
from core.security import create_access_token
from core.oauth import oauth
from schemas.auth import (
    AuthorizationUrlResponse,
    TokenResponse,
    UserResponse,
    LoginCallbackRequest,
    RegisterRequest,
    LoginRequest,
    UserUpdateRequest
)

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory store for PKCE state (in production, use Redis or similar)
_pkce_states: dict[str, dict] = {}


@router.get("/login/authorize", response_model=AuthorizationUrlResponse)
async def get_authorization_url(
    request: Request,
    redirect_uri: str
):
    """Get OAuth authorization URL for React Native.
    
    Args:
        redirect_uri: The redirect URI configured in your React Native app
                     (e.g., "com.yourcompany.yourapp://oauth/callback")
    
    Returns:
        Authorization URL and state for PKCE flow
    """
    # Generate state for CSRF protection
    state = secrets.token_urlsafe(32)
    
    # Generate code_verifier and code_challenge for PKCE
    code_verifier = secrets.token_urlsafe(32)
    # Generate code_challenge using S256 (SHA256)
    code_challenge_bytes = hashlib.sha256(code_verifier.encode('utf-8')).digest()
    code_challenge = base64.urlsafe_b64encode(code_challenge_bytes).decode('utf-8').rstrip('=')
    code_challenge_method = "S256"
    
    # Store state and code_verifier for later verification
    _pkce_states[state] = {
        "code_verifier": code_verifier,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "redirect_uri": redirect_uri
    }
    
    # Build authorization URL manually with PKCE parameters
    # authlib's authorize_redirect doesn't directly support PKCE, so we build it manually
    auth_endpoint = "https://accounts.google.com/o/oauth2/v2/auth"
    params = {
        "client_id": oauth.google.client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "access_type": "offline",
        "prompt": "consent"
    }
    authorization_url = f"{auth_endpoint}?{urlencode(params)}"
    
    return AuthorizationUrlResponse(
        authorization_url=str(authorization_url),
        state=state
    )


@router.post("/login/callback", response_model=TokenResponse)
async def exchange_code(
    request: Request,
    callback_data: LoginCallbackRequest,
    db: SessionDep
):
    """Exchange authorization code for access token.
    
    This endpoint is called by React Native after user authorizes with Google.
    """
    # Verify state
    if callback_data.state not in _pkce_states:
        raise HTTPException(status_code=400, detail="Invalid state")
    
    stored_data = _pkce_states[callback_data.state]
    code_verifier = stored_data["code_verifier"]
    redirect_uri = stored_data["redirect_uri"]
    
    # Verify redirect_uri matches
    if callback_data.redirect_uri != redirect_uri:
        raise HTTPException(status_code=400, detail="Redirect URI mismatch")
    
    # Exchange code for token with PKCE
    try:
        # Use authlib's fetch_token with PKCE code_verifier
        token_url = "https://oauth2.googleapis.com/token"
        token_data = {
            "client_id": oauth.google.client_id,
            "client_secret": oauth.google.client_secret,
            "code": callback_data.code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": code_verifier
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=token_data)
            response.raise_for_status()
            token = response.json()
        
        # Get userinfo
        if "access_token" in token:
            userinfo_url = "https://openidconnect.googleapis.com/v1/userinfo"
            headers = {"Authorization": f"Bearer {token['access_token']}"}
            async with httpx.AsyncClient() as client:
                userinfo_response = await client.get(userinfo_url, headers=headers)
                userinfo_response.raise_for_status()
                token["userinfo"] = userinfo_response.json()
    except OAuthError as e:
        raise HTTPException(status_code=401, detail=f"Token exchange failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authentication error: {str(e)}")
    
    # Get user info from token
    userinfo = token.get("userinfo")
    if not userinfo:
        raise HTTPException(status_code=401, detail="No user info in token")
    
    # Extract user data
    email = userinfo.get("email")
    name = userinfo.get("name", email)
    google_id = userinfo.get("sub")
    
    if not email:
        raise HTTPException(status_code=400, detail="Email not provided by OAuth provider")
    
    # Get or create user
    user = get_or_create_user_from_oauth(
        db=db,
        email=email,
        name=name,
        google_id=google_id
    )
    
    # Create JWT token
    access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    
    # Clean up state
    _pkce_states.pop(callback_data.state, None)
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            phone=user.phone
        )
    )


@router.post("/register", response_model=TokenResponse)
async def register(
    register_data: RegisterRequest,
    db: SessionDep
):
    """Register a new user with email and password.
    
    Args:
        register_data: User registration data (email, password, name, optional phone)
    
    Returns:
        Access token and user information
    """
    try:
        user = create_user_with_password(
            db=db,
            email=register_data.email,
            password=register_data.password,
            name=register_data.name,
            phone=register_data.phone
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Create JWT token
    access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            phone=user.phone
        )
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: LoginRequest,
    db: SessionDep
):
    """Login with email and password.
    
    Args:
        login_data: User login credentials (email and password)
    
    Returns:
        Access token and user information
    """
    user = authenticate_user(
        db=db,
        email=login_data.email,
        password=login_data.password
    )
    
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create JWT token
    access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            phone=user.phone
        )
    )


@router.get("/logout")
def logout():
    """Logout endpoint."""
    return {"message": "Logout successful"}


@router.get("/users/search", response_model=UserResponse)
async def search_user_by_email(
    email: str,
    db: SessionDep
):
    """Search for a user by email.
    
    Args:
        email: Email address to search for
    
    Returns:
        User information if found
    """
    from models.users import User
    from sqlmodel import select
    
    user = db.exec(select(User).where(User.email == email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        phone=user.phone,
        avatar_url=user.avatar_url
    )


@router.get("/users/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: CurrentUser
):
    """Get current authenticated user information.
    
    Returns:
        Current user information
    """
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        phone=current_user.phone,
        avatar_url=current_user.avatar_url
    )


@router.put("/users/me", response_model=UserResponse)
async def update_current_user(
    user_update: UserUpdateRequest,
    current_user: CurrentUser,
    db: SessionDep
):
    """Update current user information.
    
    Args:
        user_update: User information to update (name, phone, avatar_url)
        current_user: Current authenticated user
        db: Database session
    
    Returns:
        Updated user information
    """
    # Get only fields that were explicitly set in the request
    update_data = user_update.model_dump(exclude_unset=True)
    
    # If avatar_url is being set to None, delete the old avatar file
    if "avatar_url" in update_data and update_data["avatar_url"] is None and current_user.avatar_url:
        avatars_dir = Path(__file__).parent.parent.parent / "avatars"
        old_filename = current_user.avatar_url.split("/")[-1]
        old_avatar_path = avatars_dir / old_filename
        if old_avatar_path.exists():
            try:
                old_avatar_path.unlink()
            except Exception:
                pass  # Ignore errors when deleting old avatar
    
    # Import the sentinel to pass NOT_PROVIDED for fields not in update_data
    from crud.auth import NOT_PROVIDED
    
    updated_user = update_user(
        db=db,
        user=current_user,
        name=update_data.get("name", NOT_PROVIDED),
        phone=update_data.get("phone", NOT_PROVIDED),
        avatar_url=update_data.get("avatar_url", NOT_PROVIDED),
        push_notification_token=update_data.get("push_notification_token", NOT_PROVIDED)
    )
    
    return UserResponse(
        id=updated_user.id,
        email=updated_user.email,
        name=updated_user.name,
        phone=updated_user.phone,
        avatar_url=updated_user.avatar_url
    )


@router.post("/users/me/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: CurrentUser = None,
    db: SessionDep = None
):
    """Upload avatar for current user.
    
    Args:
        file: Image file to upload
        current_user: Current authenticated user
        db: Database session
    
    Returns:
        Updated user information with new avatar URL
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Create avatars directory if it doesn't exist
    # Path is relative to the backend directory
    avatars_dir = Path(__file__).parent.parent.parent / "avatars"
    avatars_dir.mkdir(exist_ok=True)
    
    # Generate unique filename
    file_extension = Path(file.filename).suffix if file.filename else '.jpg'
    unique_filename = f"{current_user.id}_{uuid.uuid4()}{file_extension}"
    file_path = avatars_dir / unique_filename
    
    # Save file
    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Delete old avatar if it exists
    if current_user.avatar_url:
        old_filename = current_user.avatar_url.split("/")[-1]
        old_avatar_path = avatars_dir / old_filename
        if old_avatar_path.exists():
            try:
                old_avatar_path.unlink()
            except Exception:
                pass  # Ignore errors when deleting old avatar
    
    # Update user avatar URL
    avatar_url = f"/api/avatars/{unique_filename}"
    updated_user = update_user(
        db=db,
        user=current_user,
        avatar_url=avatar_url
    )
    
    return UserResponse(
        id=updated_user.id,
        email=updated_user.email,
        name=updated_user.name,
        phone=updated_user.phone,
        avatar_url=updated_user.avatar_url
    )
