"""add atomic AI credit balances

Revision ID: 78f1a2c9d441
Revises: 104d0685c008
Create Date: 2026-08-01 21:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "78f1a2c9d441"  # pragma: allowlist secret
down_revision: str | Sequence[str] | None = "104d0685c008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_credit_balances",
        sa.Column("bucket_key", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("ip_hash", sa.String(), nullable=True),
        sa.Column("period_start", sa.DateTime(), nullable=False),
        sa.Column("period_end", sa.DateTime(), nullable=False),
        sa.Column("period_limit", sa.Float(), nullable=False),
        sa.Column("used", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("used >= 0", name="ck_ai_credit_balance_used_nonnegative"),
        sa.CheckConstraint("used <= period_limit", name="ck_ai_credit_balance_within_limit"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("bucket_key"),
    )
    op.create_index(
        "ix_ai_credit_balances_ip_hash",
        "ai_credit_balances",
        ["ip_hash"],
        unique=False,
    )
    op.create_index(
        "ix_ai_credit_balances_user_id",
        "ai_credit_balances",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ai_credit_balances_user_id", table_name="ai_credit_balances")
    op.drop_index("ix_ai_credit_balances_ip_hash", table_name="ai_credit_balances")
    op.drop_table("ai_credit_balances")
