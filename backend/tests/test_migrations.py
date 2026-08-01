import sqlalchemy as sa
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command


def _create_previous_schema(engine) -> None:
    metadata = sa.MetaData()
    sa.Table(
        "users",
        metadata,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("premium", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("subscription_expires", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    sa.Table(
        "email_codes_storage",
        metadata,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    sa.Table(
        "refresh_tokens",
        metadata,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    sa.Table(
        "receipts",
        metadata,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("store", sa.String()),
        sa.Column("total", sa.Float(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("receipt_expires_at", sa.DateTime()),
    )
    sa.Table(
        "receipt_items",
        metadata,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("receipt_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("product_id", sa.String()),
    )
    sa.Table(
        "subscriptions",
        metadata,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False, unique=True),
        sa.Column("purchase_token", sa.String(), nullable=False),
        sa.Column("product_id", sa.String(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    for table_name, columns in {
        "devices": (
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("device_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
        ),
        "ai_reports": (
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        ),
        "subcription_in_process": (
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        ),
        "ai_cache": (
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("context_hash", sa.String(), nullable=False),
            sa.Column("question_hash", sa.String()),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
        ),
    }.items():
        sa.Table(table_name, metadata, *columns)
    metadata.create_all(engine)


def test_hardening_migrations_upgrade_previous_schema_and_data(tmp_path):
    database = tmp_path / "migration.sqlite"
    url = f"sqlite:///{database}"
    engine = create_engine(url)
    _create_previous_schema(engine)
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "INSERT INTO users "
                "(id, email, password_hash, premium, subscription_expires, created_at) "
                "VALUES ('u1', 'fixture@example.invalid', 'hash', 1, "
                "'2030-01-01 00:00:00', CURRENT_TIMESTAMP)"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO receipts "
                "(id, date, store, total, user_id, created_at) "
                "VALUES ('r1', '2026-01-02', 'store', 12.34, 'u1', CURRENT_TIMESTAMP)"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO receipt_items "
                "(id, receipt_id, name, quantity, price) "
                "VALUES ('i1', 'r1', 'item', 1, 4.56)"
            )
        )

    config = Config("alembic.ini")
    config.attributes["database_url"] = url
    command.stamp(config, "104d0685c008")
    command.upgrade(config, "head")

    inspector = inspect(engine)
    assert {"ai_credit_balances", "rate_limit_buckets"} <= set(inspector.get_table_names())
    assert "code_hash" in {c["name"] for c in inspector.get_columns("email_codes_storage")}
    assert "token_hash" in {c["name"] for c in inspector.get_columns("refresh_tokens")}
    assert "auth_version" in {c["name"] for c in inspector.get_columns("users")}
    assert "provider" in {c["name"] for c in inspector.get_columns("subscriptions")}
    receipt_date = next(c for c in inspector.get_columns("receipts") if c["name"] == "date")
    assert receipt_date["nullable"] is False
    subscription_indexes = {index["name"] for index in inspector.get_indexes("subscriptions")}
    assert "ux_subscriptions_purchase_token" in subscription_indexes

    with engine.connect() as connection:
        receipt = connection.execute(
            sa.text("SELECT date, total_cents FROM receipts WHERE id = 'r1'")
        ).one()
        item = connection.execute(
            sa.text("SELECT unit, price_cents FROM receipt_items WHERE id = 'i1'")
        ).one()
        legacy_subscription = connection.execute(
            sa.text("SELECT provider FROM subscriptions WHERE user_id = 'u1'")
        ).scalar_one()
    assert receipt == ("2026-01-02", 1234)
    assert item == ("kg", 456)
    assert legacy_subscription == "legacy"
    engine.dispose()
