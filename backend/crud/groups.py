import uuid
import secrets
from sqlmodel import select, Session
from models.groups import Group
from models.group_members import GroupMember
from schemas.groups import GroupCreate, GroupUpdate


def generate_slug() -> str:
    """Generate a random 12-character slug."""
    return secrets.token_urlsafe(9)[:12]


def create_group(
    db: Session,
    group_data: GroupCreate,
    created_by: uuid.UUID
) -> Group:
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
        created_by=created_by
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    
    # Add creator as member
    member = GroupMember(group_id=group.id, user_id=created_by)
    db.add(member)
    db.commit()
    
    return group


def get_group_by_id(
    db: Session,
    group_id: uuid.UUID
) -> Group | None:
    """Get group by ID."""
    return db.get(Group, group_id)


def list_groups_by_user(
    db: Session,
    user_id: uuid.UUID
) -> list[Group]:
    """List groups for a user."""
    query = (
        select(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == user_id)
    )
    return db.exec(query).all()


def update_group(
    db: Session,
    group_id: uuid.UUID,
    group_data: GroupUpdate
) -> Group | None:
    """Update group."""
    group = db.get(Group, group_id)
    if not group:
        return None
    
    if group_data.name:
        group.name = group_data.name
    if group_data.description is not None:
        group.description = group_data.description
    
    db.add(group)
    db.commit()
    db.refresh(group)
    
    return group


def delete_group(
    db: Session,
    group_id: uuid.UUID
) -> bool:
    """Delete group."""
    group = db.get(Group, group_id)
    if not group:
        return False
    
    db.delete(group)
    db.commit()
    return True


def add_group_member(
    db: Session,
    group_id: uuid.UUID,
    user_id: uuid.UUID
) -> GroupMember | None:
    """Add member to group."""
    from sqlalchemy.orm import selectinload
    
    # Check if user is already a member
    existing = db.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id
        )
    ).first()
    
    if existing:
        return None  # Already a member
    
    member = GroupMember(group_id=group_id, user_id=user_id)
    db.add(member)
    db.commit()
    db.refresh(member)
    
    # Eagerly load user relationship
    statement = (
        select(GroupMember)
        .options(selectinload(GroupMember.user))
        .where(GroupMember.id == member.id)
    )
    member_with_user = db.exec(statement).first()
    
    return member_with_user


def remove_group_member(
    db: Session,
    group_id: uuid.UUID,
    user_id: uuid.UUID
) -> bool:
    """Remove member from group."""
    member = db.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id
        )
    ).first()
    
    if not member:
        return False
    
    db.delete(member)
    db.commit()
    return True


def list_group_members(
    db: Session,
    group_id: uuid.UUID
) -> list[GroupMember]:
    """List group members."""
    from sqlalchemy.orm import selectinload
    
    # Eagerly load user relationship using selectinload
    statement = (
        select(GroupMember)
        .options(selectinload(GroupMember.user))
        .where(GroupMember.group_id == group_id)
    )
    
    return list(db.exec(statement).all())


def check_user_in_group(
    db: Session,
    group_id: uuid.UUID,
    user_id: uuid.UUID
) -> bool:
    """Check if user is a member of the group."""
    member = db.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id
        )
    ).first()
    return member is not None


def get_common_groups_for_users(
    db: Session,
    user1_id: uuid.UUID,
    user2_id: uuid.UUID
) -> list[Group]:
    """Get groups where both users are members."""
    # Get groups for user1
    user1_groups = db.exec(
        select(GroupMember.group_id).where(GroupMember.user_id == user1_id)
    ).all()
    
    # Get groups for user2
    user2_groups = db.exec(
        select(GroupMember.group_id).where(GroupMember.user_id == user2_id)
    ).all()
    
    # Find intersection
    common_group_ids = set(user1_groups) & set(user2_groups)
    
    if not common_group_ids:
        return []
    
    # Get group details
    return db.exec(
        select(Group).where(Group.id.in_(common_group_ids))
    ).all()

