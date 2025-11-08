import uuid
from sqlmodel import select, Session
from models.order_items import OrderItem


def get_order_items_by_session_id(
    db: Session,
    session_id: uuid.UUID
) -> list[OrderItem]:
    """Get all order items for a session."""
    order_items = db.exec(
        select(OrderItem).where(OrderItem.session_id == session_id)
    ).all()
    return order_items


def get_order_item_by_id(
    db: Session,
    order_item_id: uuid.UUID
) -> OrderItem | None:
    """Get an order item by its ID."""
    return db.get(OrderItem, order_item_id)

