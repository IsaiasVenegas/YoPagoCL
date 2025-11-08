import uuid
from fastapi import APIRouter, HTTPException

from api.deps import SessionDep, CurrentUser
from crud import groups as crud_groups
from schemas.groups import (
    GroupCreate,
    GroupUpdate,
    GroupResponse,
    GroupMemberAdd,
    GroupMemberResponse,
)

router = APIRouter(prefix="/groups", tags=["groups"])


@router.post("", response_model=GroupResponse, status_code=201)
def create_group(group_data: GroupCreate, current_user: CurrentUser, db: SessionDep):
    """Create a new group."""
    group = crud_groups.create_group(db, group_data, current_user.id)
    return group


@router.get("/{group_id}", response_model=GroupResponse)
def get_group(group_id: uuid.UUID, db: SessionDep):
    """Get group details."""
    group = crud_groups.get_group_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.get("", response_model=list[GroupResponse])
def list_groups(current_user: CurrentUser, db: SessionDep):
    """List groups for a user."""
    groups = crud_groups.list_groups_by_user(db, current_user.id)
    return groups


@router.put("/{group_id}", response_model=GroupResponse)
def update_group(group_id: uuid.UUID, group_data: GroupUpdate, db: SessionDep):
    """Update group."""
    group = crud_groups.update_group(db, group_id, group_data)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.delete("/{group_id}", status_code=204)
def delete_group(group_id: uuid.UUID, db: SessionDep):
    """Delete group."""
    deleted = crud_groups.delete_group(db, group_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Group not found")
    return None


@router.post("/{group_id}/members", response_model=GroupMemberResponse, status_code=201)
def add_group_member(group_id: uuid.UUID, member_data: GroupMemberAdd, db: SessionDep):
    """Add member to group."""
    # Verify group exists
    group = crud_groups.get_group_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    member = crud_groups.add_group_member(db, group_id, member_data.user_id)
    if not member:
        raise HTTPException(status_code=400, detail="User is already a member of this group")
    
    return member


@router.delete("/{group_id}/members/{user_id}", status_code=204)
def remove_group_member(group_id: uuid.UUID, user_id: uuid.UUID, db: SessionDep):
    """Remove member from group."""
    removed = crud_groups.remove_group_member(db, group_id, user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Member not found in group")
    return None


@router.get("/{group_id}/members", response_model=list[GroupMemberResponse])
def list_group_members(group_id: uuid.UUID, db: SessionDep):
    """List group members."""
    group = crud_groups.get_group_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    members = crud_groups.list_group_members(db, group_id)
    return members

