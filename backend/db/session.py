from typing import Generator

from sqlmodel import Session, create_engine
from sqlalchemy.orm import sessionmaker

from core.config import settings

engine = create_engine(settings.SQLALCHEMY_DATABASE_URI) # type: ignore

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
