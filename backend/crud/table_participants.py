import uuid
from sqlmodel import select, Session
from models.table_participants import TableParticipant


def get_participants_by_session_id(
    db: Session,
    session_id: uuid.UUID
) -> list[TableParticipant]:
    """Get all participants for a session."""
    participants = db.exec(
        select(TableParticipant).where(TableParticipant.session_id == session_id)
    ).all()
    return participants


def get_participant_by_session_and_user(
    db: Session,
    session_id: uuid.UUID,
    user_id: uuid.UUID
) -> TableParticipant | None:
    """Get a participant by session_id and user_id."""
    participant = db.exec(
        select(TableParticipant).where(
            TableParticipant.session_id == session_id,
            TableParticipant.user_id == user_id
        )
    ).first()
    return participant


def get_participant_by_id(
    db: Session,
    participant_id: uuid.UUID
) -> TableParticipant | None:
    """Get a participant by its ID."""
    return db.get(TableParticipant, participant_id)


def create_participant(
    db: Session,
    session_id: uuid.UUID,
    user_id: uuid.UUID | None = None
) -> TableParticipant:
    """Create a new participant for a session."""
    participant = TableParticipant(
        session_id=session_id,
        user_id=user_id
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant

