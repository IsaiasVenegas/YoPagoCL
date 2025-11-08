import uuid
import secrets
from fastapi import APIRouter, HTTPException
from sqlmodel import select

from api.deps import SessionDep, CurrentUser
from models.groups import Group
from models.group_members import GroupMember
from schemas.groups import (
    GroupCreate,
    GroupUpdate,
    GroupResponse,
    GroupMemberAdd,
    GroupMemberResponse,
)

router = APIRouter(prefix="/groups", tags=["groups"])


def generate_slug() -> str:
    """Generate a random 12-character slug."""
    return secrets.token_urlsafe(9)[:12]


@router.post("", response_model=GroupResponse, status_code=201)
def create_group(group_data: GroupCreate, current_user: CurrentUser, db: SessionDep):
    """Create a new group."""
    slug = generate_slug()
    
    # Ensure slug is unique
    while db.exec(select(Group).where(Group.slug == slug)).first():
        slug = generate_slug()
    
    group = Group(
        name=group_data.name,
        slug=slug,
        description=group_data.description,
        currency=group_data.currency,
        created_by=current_user.id
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    
    # Add creator as member
    member = GroupMember(group_id=group.id, user_id=current_user.id)
    db.add(member)
    db.commit()
    
    return group


@router.get("/{group_id}", response_model=GroupResponse)
def get_group(group_id: uuid.UUID, db: SessionDep):
    """Get group details."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.get("", response_model=list[GroupResponse])
def list_groups(current_user: CurrentUser, db: SessionDep):
    """List groups for a user."""
    query = (
        select(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == current_user.id)
    )
    groups = db.exec(query).all()
    return groups


@router.put("/{group_id}", response_model=GroupResponse)
def update_group(group_id: uuid.UUID, group_data: GroupUpdate, db: SessionDep):
    """Update group."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if group_data.name:
        group.name = group_data.name
    if group_data.description is not None:
        group.description = group_data.description
    
    db.add(group)
    db.commit()
    db.refresh(group)
    
    return group


@router.delete("/{group_id}", status_code=204)
def delete_group(group_id: uuid.UUID, db: SessionDep):
    """Delete group."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    db.delete(group)
    db.commit()
    return None


@router.post("/{group_id}/members", response_model=GroupMemberResponse, status_code=201)
def add_group_member(group_id: uuid.UUID, member_data: GroupMemberAdd, db: SessionDep):
    """Add member to group."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if user is already a member
    existing = db.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == member_data.user_id
        )
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member of this group")
    
    member = GroupMember(group_id=group_id, user_id=member_data.user_id)
    db.add(member)
    db.commit()
    db.refresh(member)
    
    return member


@router.delete("/{group_id}/members/{user_id}", status_code=204)
def remove_group_member(group_id: uuid.UUID, user_id: uuid.UUID, db: SessionDep):
    """Remove member from group."""
    member = db.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in group")
    
    db.delete(member)
    db.commit()
    return None


@router.get("/{group_id}/members", response_model=list[GroupMemberResponse])
def list_group_members(group_id: uuid.UUID, db: SessionDep):
    """List group members."""
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    members = db.exec(
        select(GroupMember).where(GroupMember.group_id == group_id)
    ).all()
    
    return members

