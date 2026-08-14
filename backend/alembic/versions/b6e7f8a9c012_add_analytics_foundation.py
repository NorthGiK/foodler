"""Add privacy-preserving analytics foundations.

Revision ID: b6e7f8a9c012
Revises: d5e6f7a8b910
Create Date: 2026-08-14 00:00:00
"""

import sqlalchemy as sa

from alembic import op

revision = "b6e7f8a9c012"
down_revision = "d5e6f7a8b910"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "analytics_enabled" not in {column["name"] for column in inspector.get_columns("users")}:
        op.add_column(
            "users",
            sa.Column("analytics_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        )

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
        op.create_index(
            "ix_analytics_events_name_occurred", "analytics_events", ["event_name", "occurred_at"]
        )
        op.create_index(
            "ix_analytics_events_user_occurred", "analytics_events", ["user_id", "occurred_at"]
        )
        op.create_index(
            "ix_analytics_events_installation_occurred",
            "analytics_events",
            ["installation_id", "occurred_at"],
        )
        op.create_index(
            "ix_analytics_events_session_occurred", "analytics_events", ["session_id", "occurred_at"]
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "analytics_events" in inspector.get_table_names():
        op.drop_table("analytics_events")
    if "analytics_installations" in inspector.get_table_names():
        op.drop_table("analytics_installations")
    if "analytics_enabled" in {column["name"] for column in inspector.get_columns("users")}:
        with op.batch_alter_table("users") as batch:
            batch.drop_column("analytics_enabled")
