from typing import Annotated
from sqlmodel import Session
from fastapi import Depends
from db.session import get_db


SessionDep = Annotated[Session, Depends(get_db)]