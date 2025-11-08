import secrets
import hashlib
import base64
import httpx
from fastapi import APIRouter, HTTPException, Request
from authlib.integrations.starlette_client import OAuthError
from urllib.parse import urlencode

from api.deps import SessionDep
from crud.auth import get_or_create_user_from_oauth
from core.security import create_access_token
from schemas.auth import AuthorizationUrlResponse, TokenResponse, UserResponse, LoginCallbackRequest
from main import oauth

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


@router.get("/logout")
def logout():
    """Logout endpoint."""
    return {"message": "Logout successful"}
