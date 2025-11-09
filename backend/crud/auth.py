import uuid
from sqlmodel import select, Session
from models.users import User
from core.security import get_password_hash, verify_password

# Sentinel value to distinguish "not provided" from "explicitly set to None"
# Made public so it can be imported by routers
NOT_PROVIDED = object()


def get_or_create_user_from_oauth(
    db: Session,
    email: str,
    name: str,
    google_id: str | None = None
) -> User:
    """Get existing user or create new user from OAuth data."""
    # Try to find existing user by email
    user = db.scalars(select(User).where(User.email == email)).first()
    
    if user:
        # Update name if it changed
        if user.name != name:
            user.name = name
            db.add(user)
            db.commit()
            db.refresh(user)
        return user
    
    # Create new user
    user = User(
        id=uuid.uuid4(),
        email=email,
        name=name,
        hashed_password=None  # OAuth users don't have passwords
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user


def create_user_with_password(
    db: Session,
    email: str,
    password: str,
    name: str,
    phone: str | None = None
) -> User:
    """Create a new user with email and password."""
    # Check if user already exists
    existing_user = db.scalars(select(User).where(User.email == email)).first()
    if existing_user:
        raise ValueError("User with this email already exists")
    
    # Hash password
    hashed_password = get_password_hash(password)
    
    # Create new user
    user = User(
        id=uuid.uuid4(),
        email=email,
        name=name,
        phone=phone,
        hashed_password=hashed_password
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user


def authenticate_user(
    db: Session,
    email: str,
    password: str
) -> User | None:
    """Authenticate a user with email and password."""
    user = db.scalars(select(User).where(User.email == email)).first()
    
    if not user:
        return None
    
    # Check if user has a password (not OAuth-only user)
    if not user.hashed_password:
        return None
    
    # Verify password
    if not verify_password(password, user.hashed_password):
        return None
    
    return user


def update_user(
    db: Session,
    user: User,
    name: str | None = NOT_PROVIDED,
    phone: str | None = NOT_PROVIDED,
    avatar_url: str | None = NOT_PROVIDED,
    push_notification_token: str | None = NOT_PROVIDED
) -> User:
    """Update user information.
    
    Args:
        db: Database session
        user: User to update
        name: New name (optional, pass None to keep unchanged)
        phone: New phone (optional, pass None to keep unchanged)
        avatar_url: New avatar URL (optional, pass None to delete avatar)
        push_notification_token: New push notification token (optional, pass None to keep unchanged)
    
    Returns:
        Updated user
    """
    if name is not NOT_PROVIDED:
        user.name = name
    if phone is not NOT_PROVIDED:
        user.phone = phone
    if avatar_url is not NOT_PROVIDED:
        user.avatar_url = avatar_url
    if push_notification_token is not NOT_PROVIDED:
        user.push_notification_token = push_notification_token
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user

