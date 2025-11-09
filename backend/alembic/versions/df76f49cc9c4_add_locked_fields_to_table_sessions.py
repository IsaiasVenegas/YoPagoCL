"""add_locked_fields_to_table_sessions

Revision ID: df76f49cc9c4
Revises: 95233890d325
Create Date: 2025-11-09 04:39:54.449471

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'df76f49cc9c4'
down_revision: Union[str, Sequence[str], None] = '95233890d325'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add locked and locked_by_user_id columns to table_sessions
    op.add_column('table_sessions', sa.Column('locked', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('table_sessions', sa.Column('locked_by_user_id', sa.Uuid(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove locked and locked_by_user_id columns from table_sessions
    op.drop_column('table_sessions', 'locked_by_user_id')
    op.drop_column('table_sessions', 'locked')
