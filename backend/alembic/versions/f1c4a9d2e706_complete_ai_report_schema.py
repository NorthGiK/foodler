"""Complete legacy AI cache and report tables.

Revision ID: f1c4a9d2e706
Revises: e6f2b8a3d901
Create Date: 2026-08-03 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f1c4a9d2e706"
down_revision: str | Sequence[str] | None = "e6f2b8a3d901"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "ai_reports" in tables:
        columns = _columns("ai_reports")
        if "action" not in columns:
            op.add_column(
                "ai_reports",
                sa.Column("action", sa.String(), nullable=False, server_default="legacy"),
            )
        if "snapshot" not in columns:
            op.add_column("ai_reports", sa.Column("snapshot", sa.String(), nullable=True))
        if "response" not in columns:
            op.add_column("ai_reports", sa.Column("response", sa.String(), nullable=True))

    if "ai_cache" in tables:
        columns = _columns("ai_cache")
        if "response" not in columns:
            op.add_column(
                "ai_cache",
                sa.Column("response", sa.Text(), nullable=False, server_default="[]"),
            )
        if "created_at" not in columns:
            op.add_column(
                "ai_cache",
                sa.Column(
                    "created_at",
                    sa.DateTime(),
                    nullable=False,
                    server_default=sa.text("CURRENT_TIMESTAMP"),
                ),
            )


def downgrade() -> None:
    # These columns are required to read existing cached responses and reports.
    # A downgrade intentionally preserves them to avoid deleting user history.
    pass
