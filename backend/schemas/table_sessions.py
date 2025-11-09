import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class SessionResponse(BaseModel):
    id: uuid.UUID
    restaurant_id: str
    table_id: uuid.UUID
    session_start: datetime
    session_end: Optional[datetime]
    status: str
    total_amount: Optional[int]
    currency: str
    updated_at: datetime

    class Config:
        from_attributes = True


class OrderItemCreate(BaseModel):
    item_name: str
    unit_price: int

class OrderItemResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    item_name: str
    unit_price: int
    ordered_at: datetime

    class Config:
        from_attributes = True


class TableParticipantResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    user_id: Optional[uuid.UUID]
    joined_at: datetime

    class Config:
        from_attributes = True

class SessionCreate(BaseModel):
    restaurant_id: str
    table_id: uuid.UUID
    session_start: datetime
    items: list[OrderItemCreate]


class SessionClose(BaseModel):
    status: str = "closed"

