"""Create the AI credit usage ledger when upgrading legacy databases.

Revision ID: e6f2b8a3d901
Revises: d4b7a9c2e610
Create Date: 2026-08-03 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e6f2b8a3d901"
down_revision: str | Sequence[str] | None = "d4b7a9c2e610"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "ai_credit_usage" in tables:
        return

    op.create_table(
        "ai_credit_usage",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("ip_hash", sa.String(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("credits", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index("ix_ai_credit_usage_user_id", "ai_credit_usage", ["user_id"])
    op.create_index("ix_ai_credit_usage_ip_hash", "ai_credit_usage", ["ip_hash"])


def downgrade() -> None:
    if "ai_credit_usage" not in sa.inspect(op.get_bind()).get_table_names():
        return
    op.drop_index("ix_ai_credit_usage_ip_hash", table_name="ai_credit_usage")
    op.drop_index("ix_ai_credit_usage_user_id", table_name="ai_credit_usage")
    op.drop_table("ai_credit_usage")
