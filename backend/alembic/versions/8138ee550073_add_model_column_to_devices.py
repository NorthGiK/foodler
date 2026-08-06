"""empty message

Revision ID: 8138ee550073
Revises: f1c4a9d2e706
Create Date: 2026-08-06 19:02:57.690584

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8138ee550073'
down_revision: Union[str, Sequence[str], None] = 'f1c4a9d2e706'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}

def upgrade() -> None:
    """Upgrade schema."""
    if "model" not in _columns("devices"):
        op.add_column("devices", sa.Column("model", sa.String(), nullable=True, insert_default=None))
    
    if "os" not in _columns("devices"):
        op.add_column("devices", sa.Column("os", sa.String()))


def downgrade() -> None:
    """Downgrade schema."""
    pass
