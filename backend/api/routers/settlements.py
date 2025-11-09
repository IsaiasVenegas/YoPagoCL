import uuid
from typing import Optional
from fastapi import APIRouter, Query

from api.deps import SessionDep
from crud import settlements as crud_settlements
from schemas.settlements import SettlementCreate, SettlementResponse

router = APIRouter(prefix="/settlements", tags=["settlements"])


@router.post("", response_model=SettlementResponse, status_code=201)
def create_settlement(settlement_data: SettlementCreate, db: SessionDep):
    """Create a settlement (payment outside restaurant)."""
    settlement = crud_settlements.create_settlement(db, settlement_data)
    return settlement


@router.get("", response_model=list[SettlementResponse])
def list_settlements(
    user_id: Optional[uuid.UUID] = Query(None, description="Filter by user (from_user or to_user)"),
    group_id: Optional[uuid.UUID] = Query(None, description="Filter by group"),
    invoice_id: Optional[uuid.UUID] = Query(None, description="Filter by invoice"),
    table_session_id: Optional[uuid.UUID] = Query(None, description="Filter by table session"),
    db: SessionDep = None
):
    """List settlements with optional filters."""
    settlements = crud_settlements.list_settlements(
        db, user_id=user_id, group_id=group_id, invoice_id=invoice_id, table_session_id=table_session_id
    )
    return settlements


@router.get("/groups/{group_id}/settlements", response_model=list[SettlementResponse])
def get_group_settlements(group_id: uuid.UUID, db: SessionDep):
    """Get settlements for a group."""
    settlements = crud_settlements.get_group_settlements(db, group_id)
    return settlements

