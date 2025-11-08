import uuid
from sqlmodel import select, Session
from models.users import User


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

