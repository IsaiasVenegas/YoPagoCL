import uuid
from sqlmodel import select, Session
from models.item_assignments import ItemAssignment
from models.order_items import OrderItem


def get_assignments_by_session_id(
    db: Session,
    session_id: uuid.UUID
) -> list[ItemAssignment]:
    """Get all item assignments for a session (via join with OrderItem)."""
    assignments = db.exec(
        select(ItemAssignment)
        .join(OrderItem, OrderItem.id == ItemAssignment.order_item_id)
        .where(OrderItem.session_id == session_id)
    ).all()
    return assignments


def get_assignment_by_id(
    db: Session,
    assignment_id: uuid.UUID
) -> ItemAssignment | None:
    """Get an item assignment by its ID."""
    return db.get(ItemAssignment, assignment_id)

def get_assignments_by_order_item_id(
    db: Session,
    order_item_id: uuid.UUID
) -> list[ItemAssignment]:
    """Get all item assignments for an order item."""
    return db.exec(
        select(ItemAssignment)
        .where(ItemAssignment.order_item_id == order_item_id)
    ).all()


def create_assignment(
    db: Session,
    order_item_id: uuid.UUID,
    creditor_id: uuid.UUID,
    debtor_id: uuid.UUID | None = None,
    assigned_amount: int = 0
) -> ItemAssignment:
    """Create a new item assignment."""
    assignment = ItemAssignment(
        order_item_id=order_item_id,
        creditor_id=creditor_id,
        debtor_id=debtor_id,
        assigned_amount=assigned_amount
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


def update_assignment(
    db: Session,
    assignment_id: uuid.UUID,
    assigned_amount: int
) -> ItemAssignment:
    """Update an item assignment's assigned amount."""
    assignment = db.get(ItemAssignment, assignment_id)
    if not assignment:
        raise ValueError("Assignment not found")
    
    assignment.assigned_amount = assigned_amount
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


def delete_assignment(
    db: Session,
    assignment_id: uuid.UUID
) -> None:
    """Delete an item assignment."""
    assignment = db.get(ItemAssignment, assignment_id)
    if not assignment:
        raise ValueError("Assignment not found")
    
    db.delete(assignment)
    db.commit()

