"""Replace local product analytics with Firebase identity mode.

Revision ID: f8a9b0c1d234
Revises: e7f8a9b0c123
Create Date: 2026-08-28 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f8a9b0c1d234"  # pragma: allowlist secret
down_revision: str | Sequence[str] | None = "e7f8a9b0c123"  # pragma: allowlist secret
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    columns = _columns("users")
    if "analytics_identity_mode" not in columns:
        op.add_column(
            "users",
            sa.Column(
                "analytics_identity_mode",
                sa.String(),
                nullable=False,
                server_default="identified",
            ),
        )
        if "analytics_enabled" in columns:
            op.execute(
                "UPDATE users SET analytics_identity_mode = "
                "CASE WHEN analytics_enabled THEN 'identified' ELSE 'anonymous' END"
            )
        with op.batch_alter_table("users") as batch:
            batch.alter_column("analytics_identity_mode", server_default=None)

    tables = _tables()
    if "analytics_events" in tables:
        op.drop_table("analytics_events")
    if "analytics_installations" in tables:
        op.drop_table("analytics_installations")
    if "analytics_enabled" in _columns("users"):
        with op.batch_alter_table("users") as batch:
            batch.drop_column("analytics_enabled")


def downgrade() -> None:
    columns = _columns("users")
    if "analytics_enabled" not in columns:
        op.add_column(
            "users",
            sa.Column("analytics_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        )
        if "analytics_identity_mode" in columns:
            op.execute(
                "UPDATE users SET analytics_enabled = "
                "CASE WHEN analytics_identity_mode = 'identified' THEN 1 ELSE 0 END"
            )
        with op.batch_alter_table("users") as batch:
            batch.alter_column("analytics_enabled", server_default=None)

    tables = _tables()
    if "analytics_installations" not in tables:
        op.create_table(
            "analytics_installations",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("installation_hash", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("first_seen_at", sa.DateTime(), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("installation_hash"),
        )
        op.create_index(
            "ix_analytics_installations_installation_hash",
            "analytics_installations",
            ["installation_hash"],
        )
        op.create_index("ix_analytics_installations_user_id", "analytics_installations", ["user_id"])
    if "analytics_events" not in tables:
        op.create_table(
            "analytics_events",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("idempotency_id", sa.String(), nullable=False),
            sa.Column("event_name", sa.String(), nullable=False),
            sa.Column("occurred_at", sa.DateTime(), nullable=False),
            sa.Column("received_at", sa.DateTime(), nullable=False),
            sa.Column("installation_id", sa.String(), nullable=True),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("session_id", sa.String(), nullable=True),
            sa.Column("platform", sa.String(), nullable=True),
            sa.Column("app_version", sa.String(), nullable=True),
            sa.Column("app_build", sa.String(), nullable=True),
            sa.Column("os_version", sa.String(), nullable=True),
            sa.Column("locale", sa.String(), nullable=True),
            sa.Column("timezone", sa.String(), nullable=True),
            sa.Column("properties", sa.JSON(), nullable=False),
            sa.ForeignKeyConstraint(["installation_id"], ["analytics_installations.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("idempotency_id"),
        )
        op.create_index("ix_analytics_events_idempotency_id", "analytics_events", ["idempotency_id"])
        op.create_index("ix_analytics_events_name_occurred", "analytics_events", ["event_name", "occurred_at"])
        op.create_index("ix_analytics_events_user_occurred", "analytics_events", ["user_id", "occurred_at"])
        op.create_index(
            "ix_analytics_events_installation_occurred",
            "analytics_events",
            ["installation_id", "occurred_at"],
        )
        op.create_index(
            "ix_analytics_events_session_occurred",
            "analytics_events",
            ["session_id", "occurred_at"],
        )

    if "analytics_identity_mode" in _columns("users"):
        with op.batch_alter_table("users") as batch:
            batch.drop_column("analytics_identity_mode")
