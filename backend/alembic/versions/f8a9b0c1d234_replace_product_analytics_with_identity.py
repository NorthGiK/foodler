"""Replace backend product analytics with MyTracker identity state.

Revision ID: f8a9b0c1d234
Revises: e7f8a9b0c123
Create Date: 2026-08-29 00:00:00
"""

import uuid

import sqlalchemy as sa

from alembic import op

revision = "f8a9b0c1d234"
down_revision = "e7f8a9b0c123"
branch_labels = None
depends_on = None


def _user_columns() -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "analytics_events" in tables:
        op.drop_table("analytics_events")
    if "analytics_installations" in tables:
        op.drop_table("analytics_installations")

    columns = _user_columns()
    with op.batch_alter_table("users") as batch:
        if "analytics_enabled" in columns:
            batch.alter_column(
                "analytics_enabled",
                new_column_name="analytics_identity_enabled",
                existing_type=sa.Boolean(),
            )
        if "analytics_external_id" not in columns:
            batch.add_column(sa.Column("analytics_external_id", sa.String(), nullable=True))

    connection = op.get_bind()
    users_without_external_id = connection.execute(
        sa.text("SELECT id FROM users WHERE analytics_external_id IS NULL")
    ).scalars()
    for user_id in users_without_external_id:
        connection.execute(
            sa.text("UPDATE users SET analytics_external_id = :external_id WHERE id = :id"),
            {"external_id": uuid.uuid4().hex, "id": user_id},
        )

    with op.batch_alter_table("users") as batch:
        batch.alter_column("analytics_external_id", nullable=False, existing_type=sa.String())
    op.create_index("ux_users_analytics_external_id", "users", ["analytics_external_id"], unique=True)


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
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
        op.create_index("ix_analytics_events_installation_occurred", "analytics_events", ["installation_id", "occurred_at"])
        op.create_index("ix_analytics_events_session_occurred", "analytics_events", ["session_id", "occurred_at"])
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
        op.create_index("ix_analytics_installations_installation_hash", "analytics_installations", ["installation_hash"])
        op.create_index("ix_analytics_installations_user_id", "analytics_installations", ["user_id"])

    columns = _user_columns()
    if "analytics_external_id" in columns:
        op.drop_index("ux_users_analytics_external_id", table_name="users")
    with op.batch_alter_table("users") as batch:
        if "analytics_external_id" in columns:
            batch.drop_column("analytics_external_id")
        if "analytics_identity_enabled" in columns:
            batch.alter_column(
                "analytics_identity_enabled",
                new_column_name="analytics_enabled",
                existing_type=sa.Boolean(),
            )
