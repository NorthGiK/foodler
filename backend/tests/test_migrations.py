from datetime import datetime

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
                "'2030-01-01 00:00:00', '2024-01-02 03:04:05')"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO receipts "
                "(id, date, store, total, user_id, created_at) "
                "VALUES ('r1', '2026-01-02', 'store', 12.34, 'u1', '2024-02-03 04:05:06')"
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
    assert {
        "ai_credit_balances",
        "rate_limit_buckets",
        "analytics_installations",
        "analytics_events",
    } <= set(inspector.get_table_names())
    assert "code_hash" in {c["name"] for c in inspector.get_columns("email_codes_storage")}
    assert "token_hash" in {c["name"] for c in inspector.get_columns("refresh_tokens")}
    assert "auth_version" in {c["name"] for c in inspector.get_columns("users")}
    assert "provider" in {c["name"] for c in inspector.get_columns("subscriptions")}
    assert "analytics_enabled" in {c["name"] for c in inspector.get_columns("users")}
    receipt_date = next(c for c in inspector.get_columns("receipts") if c["name"] == "date")
    assert receipt_date["nullable"] is False
    subscription_indexes = {index["name"] for index in inspector.get_indexes("subscriptions")}
    assert "ux_subscriptions_purchase_token" in subscription_indexes
    provider_check = next(
        constraint["sqltext"]
        for constraint in inspector.get_check_constraints("subscriptions")
        if constraint["name"] == "ck_subscriptions_provider"
    )
    assert provider_check == "provider IN ('yookassa', 'legacy')"

    with engine.connect() as connection:
        receipt = connection.execute(
            sa.text("SELECT date, total_cents, created_at FROM receipts WHERE id = 'r1'")
        ).one()
        item = connection.execute(
            sa.text("SELECT unit, price_cents FROM receipt_items WHERE id = 'i1'")
        ).one()
        legacy_subscription = connection.execute(
            sa.text("SELECT provider FROM subscriptions WHERE user_id = 'u1'")
        ).scalar_one()
        analytics_enabled = connection.execute(
            sa.text("SELECT analytics_enabled FROM users WHERE id = 'u1'")
        ).scalar_one()
        user_created_at = connection.execute(
            sa.text("SELECT created_at FROM users WHERE id = 'u1'")
        ).scalar_one()
    assert receipt == ("2026-01-02", 1234, "2024-02-03 04:05:06")
    assert item == ("kg", 456)
    assert legacy_subscription == "legacy"
    assert analytics_enabled == 1
    assert user_created_at == "2024-01-02 03:04:05"
    engine.dispose()


def test_migrations_create_schema_for_empty_database(tmp_path):
    database = tmp_path / "fresh.sqlite"
    url = f"sqlite:///{database}"
    config = Config("alembic.ini")
    config.attributes["database_url"] = url

    command.upgrade(config, "head")

    engine = create_engine(url)
    inspector = inspect(engine)
    assert {
        "users",
        "receipts",
        "receipt_items",
        "ai_credit_usage",
        "ai_credit_balances",
        "rate_limit_buckets",
        "analytics_installations",
        "analytics_events",
    } <= set(inspector.get_table_names())
    with engine.connect() as connection:
        assert connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one() == (
            "b6e7f8a9c012"  # pragma: allowlist secret
        )
    assert {"action", "snapshot", "response"} <= {
        column["name"] for column in inspector.get_columns("ai_reports")
    }
    assert {"response", "created_at"} <= {
        column["name"] for column in inspector.get_columns("ai_cache")
    }
    analytics_event_indexes = {index["name"] for index in inspector.get_indexes("analytics_events")}
    assert {
        "ix_analytics_events_name_occurred",
        "ix_analytics_events_user_occurred",
        "ix_analytics_events_installation_occurred",
        "ix_analytics_events_session_occurred",
    } <= analytics_event_indexes
    engine.dispose()


def test_removed_subscription_provider_is_revoked_during_upgrade(tmp_path):
    database = tmp_path / "removed-provider.sqlite"
    url = f"sqlite:///{database}"
    engine = create_engine(url)
    metadata = sa.MetaData()
    users = sa.Table(
        "users",
        metadata,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("premium", sa.Boolean(), nullable=False),
        sa.Column("subscription_expires", sa.DateTime()),
    )
    subscriptions = sa.Table(
        "subscriptions",
        metadata,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("purchase_token", sa.String(), nullable=False),
        sa.Column("product_id", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("length(provider) > 0", name="ck_subscriptions_provider"),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(
            users.insert(),
            [
                {
                    "id": "unsupported-user",
                    "premium": True,
                    "subscription_expires": datetime(2030, 1, 1),
                },
                {
                    "id": "supported-user",
                    "premium": True,
                    "subscription_expires": datetime(2030, 1, 1),
                },
            ],
        )
        connection.execute(
            subscriptions.insert(),
            [
                {
                    "id": "unsupported-subscription",
                    "user_id": "unsupported-user",
                    "purchase_token": "unsupported:token",
                    "product_id": "unsupported-product",
                    "provider": "unsupported",
                    "active": True,
                    "expires_at": datetime(2030, 1, 1),
                    "created_at": datetime(2026, 8, 2),
                },
                {
                    "id": "supported-subscription",
                    "user_id": "supported-user",
                    "purchase_token": "yookassa:payment",
                    "product_id": "premium_monthly",
                    "provider": "yookassa",
                    "active": True,
                    "expires_at": datetime(2030, 1, 1),
                    "created_at": datetime(2026, 8, 2),
                },
            ],
        )

    config = Config("alembic.ini")
    config.attributes["database_url"] = url
    command.stamp(config, "c9a2e7714f30")  # pragma: allowlist secret
    command.upgrade(config, "f1c4a9d2e706")

    with engine.connect() as connection:
        unsupported_user = connection.execute(
            sa.select(users.c.premium, users.c.subscription_expires).where(
                users.c.id == "unsupported-user"
            )
        ).one()
        remaining_subscriptions = connection.execute(
            sa.select(subscriptions.c.user_id, subscriptions.c.provider)
        ).all()

    assert unsupported_user == (False, None)
    assert remaining_subscriptions == [("supported-user", "yookassa")]
    engine.dispose()
