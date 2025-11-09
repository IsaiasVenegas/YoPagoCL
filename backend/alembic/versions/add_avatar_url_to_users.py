"""add_avatar_url_to_users

Revision ID: add_avatar_url_users
Revises: d8d987484770
Create Date: 2025-01-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'add_avatar_url_users'
down_revision: Union[str, Sequence[str], None] = 'd8d987484770'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('avatar_url', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'avatar_url')

