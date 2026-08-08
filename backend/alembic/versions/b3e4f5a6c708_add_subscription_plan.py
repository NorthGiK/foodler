"""Persist the plan selected for a YooKassa payment."""

from alembic import op
import sqlalchemy as sa

revision = "b3e4f5a6c708"
down_revision = "a2d3f4e5b607"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subcription_in_process", sa.Column("plan_id", sa.String(), nullable=False, server_default="budget_monthly"))


def downgrade() -> None:
    op.drop_column("subcription_in_process", "plan_id")
