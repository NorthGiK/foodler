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
    } <= set(inspector.get_table_names())
    assert "code_hash" in {c["name"] for c in inspector.get_columns("email_codes_storage")}
    assert "token_hash" in {c["name"] for c in inspector.get_columns("refresh_tokens")}
    assert "auth_version" in {c["name"] for c in inspector.get_columns("users")}
    assert "provider" in {c["name"] for c in inspector.get_columns("subscriptions")}
    user_columns = {c["name"] for c in inspector.get_columns("users")}
    assert "analytics_enabled" not in user_columns
    assert "analytics_identity_mode" in user_columns
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
        analytics_identity_mode = connection.execute(
            sa.text("SELECT analytics_identity_mode FROM users WHERE id = 'u1'")
        ).scalar_one()
        user_created_at = connection.execute(
            sa.text("SELECT created_at FROM users WHERE id = 'u1'")
        ).scalar_one()
    assert receipt == ("2026-01-02", 1234, "2024-02-03 04:05:06")
    assert item == ("kg", 456)
    assert legacy_subscription == "legacy"
    assert analytics_identity_mode == "identified"
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
    } <= set(inspector.get_table_names())
    with engine.connect() as connection:
        assert connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one() == (
            "f8a9b0c1d234"  # pragma: allowlist secret
        )
    assert {"action", "snapshot", "response"} <= {
        column["name"] for column in inspector.get_columns("ai_reports")
    }
    assert {"response", "created_at"} <= {
        column["name"] for column in inspector.get_columns("ai_cache")
    }
    assert "analytics_identity_mode" in {c["name"] for c in inspector.get_columns("users")}
    assert "analytics_installations" not in inspector.get_table_names()
    assert "analytics_events" not in inspector.get_table_names()
    engine.dispose()


def test_firebase_analytics_migration_preserves_preference_and_downgrades(tmp_path):
    database = tmp_path / "analytics-identity.sqlite"
    url = f"sqlite:///{database}"
    config = Config("alembic.ini")
    config.attributes["database_url"] = url
    command.upgrade(config, "e7f8a9b0c123")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "INSERT INTO users (id, email, password_hash, premium, analytics_enabled, created_at) "
                "VALUES ('identified', 'identified@example.invalid', 'hash', 0, 1, CURRENT_TIMESTAMP), "
                "('anonymous', 'anonymous@example.invalid', 'hash', 0, 0, CURRENT_TIMESTAMP)"
            )
        )

    command.upgrade(config, "head")
    inspector = inspect(engine)
    assert "analytics_enabled" not in {column["name"] for column in inspector.get_columns("users")}
    assert "analytics_events" not in inspector.get_table_names()
    assert "analytics_installations" not in inspector.get_table_names()
    with engine.connect() as connection:
        modes = {
            row.id: row.analytics_identity_mode
            for row in connection.execute(
                sa.text("SELECT id, analytics_identity_mode FROM users")
            )
        }
    assert modes == {"identified": "identified", "anonymous": "anonymous"}

    command.downgrade(config, "e7f8a9b0c123")
    inspector = inspect(engine)
    assert {"analytics_installations", "analytics_events"} <= set(inspector.get_table_names())
    assert "analytics_identity_mode" not in {column["name"] for column in inspector.get_columns("users")}
    with engine.connect() as connection:
        preferences = {
            row.id: row.analytics_enabled
            for row in connection.execute(
                sa.text("SELECT id, analytics_enabled FROM users")
            )
        }
        event_count = connection.execute(sa.text("SELECT COUNT(*) FROM analytics_events")).scalar_one()
    assert preferences == {"identified": 1, "anonymous": 0}
    assert event_count == 0
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


def test_category_migration_creates_cache_snapshots_and_normalized_index(tmp_path):
    database = tmp_path / "categories.sqlite"
    url = f"sqlite:///{database}"
    config = Config("alembic.ini")
    config.attributes["database_url"] = url
    command.upgrade(config, "head")

    engine = create_engine(url)
    inspector = inspect(engine)
    assert "product_category_assignments" in inspector.get_table_names()
    product_columns = {column["name"]: column for column in inspector.get_columns("products")}
    assert product_columns["normalized_name"]["nullable"] is False
    assert "ix_products_normalized_name" in {
        index["name"] for index in inspector.get_indexes("products")
    }
    item_columns = {column["name"] for column in inspector.get_columns("receipt_items")}
    assert {
        "gtin",
        "category",
        "category_source",
        "category_confidence",
        "category_taxonomy_version",
        "category_model_version",
    } <= item_columns
    assert "ix_category_assignment_lookup" in {
        index["name"] for index in inspector.get_indexes("product_category_assignments")
    }
    assert any(
        constraint["column_names"] == ["key_type", "lookup_key", "merchant_scope"]
        for constraint in inspector.get_unique_constraints("product_category_assignments")
    )
    engine.dispose()
