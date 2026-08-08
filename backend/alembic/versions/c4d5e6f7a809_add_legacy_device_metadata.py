"""Backfill device metadata columns missing from pre-Alembic databases."""

import sqlalchemy as sa

from alembic import op

revision = "c4d5e6f7a809"
down_revision = "b3e4f5a6c708"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("devices")}
    if "model" not in columns:
        op.add_column("devices", sa.Column("model", sa.String(), nullable=True))
    if "os" not in columns:
        op.add_column("devices", sa.Column("os", sa.String(), nullable=True))


def downgrade() -> None:
    # Older schemas can already contain these fields; retaining nullable metadata
    # keeps downgrade safe for all legacy database variants.
    pass
