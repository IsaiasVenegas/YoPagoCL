import uuid
from sqlmodel import select, Session
from models.users import User
from core.security import get_password_hash, verify_password


def get_or_create_user_from_oauth(
    db: Session,
    email: str,
    name: str,
    google_id: str | None = None
) -> User:
    """Get existing user or create new user from OAuth data."""
    # Try to find existing user by email
    user = db.exec(select(User).where(User.email == email)).first()
    
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
    existing_user = db.exec(select(User).where(User.email == email)).first()
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
    user = db.exec(select(User).where(User.email == email)).first()
    
    if not user:
        return None
    
    # Check if user has a password (not OAuth-only user)
    if not user.hashed_password:
        return None
    
    # Verify password
    if not verify_password(password, user.hashed_password):
        return None
    
    return user

