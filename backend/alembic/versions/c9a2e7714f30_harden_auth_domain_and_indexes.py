"""harden auth, domain types, subscriptions, rate limits and indexes

Revision ID: c9a2e7714f30
Revises: 78f1a2c9d441
Create Date: 2026-08-01 22:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c9a2e7714f30"  # pragma: allowlist secret
down_revision: str | Sequence[str] | None = "78f1a2c9d441"  # pragma: allowlist secret
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table) if index["name"]
    }


def _checks(table: str) -> set[str]:
    return {
        constraint["name"]
        for constraint in sa.inspect(op.get_bind()).get_check_constraints(table)
        if constraint["name"]
    }


def _create_index(name: str, table: str, columns: list[str], *, unique: bool = False) -> None:
    if name not in _indexes(table):
        op.create_index(name, table, columns, unique=unique)


def upgrade() -> None:
    if "auth_version" not in _columns("users"):
        op.add_column(
            "users",
            sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"),
        )

    if "code_hash" not in _columns("email_codes_storage"):
        op.add_column(
            "email_codes_storage",
            sa.Column("code_hash", sa.String(), nullable=True),
        )
        op.execute("UPDATE email_codes_storage SET code_hash = 'invalidated:' || id")
        with op.batch_alter_table("email_codes_storage") as batch:
            if "ix_email_codes_storage_code" in _indexes("email_codes_storage"):
                batch.drop_index("ix_email_codes_storage_code")
            batch.alter_column("code_hash", existing_type=sa.String(), nullable=False)
            batch.drop_column("code")
        _create_index(
            "ix_email_codes_storage_code_hash",
            "email_codes_storage",
            ["code_hash"],
        )

    if "token_hash" not in _columns("refresh_tokens"):
        op.add_column(
            "refresh_tokens",
            sa.Column("token_hash", sa.String(), nullable=True),
        )
        op.execute("UPDATE refresh_tokens SET token_hash = 'invalidated:' || id")
        with op.batch_alter_table("refresh_tokens") as batch:
            if "ix_refresh_tokens_token" in _indexes("refresh_tokens"):
                batch.drop_index("ix_refresh_tokens_token")
            batch.alter_column("token_hash", existing_type=sa.String(), nullable=False)
            batch.drop_column("token")
        _create_index(
            "ix_refresh_tokens_token_hash",
            "refresh_tokens",
            ["token_hash"],
            unique=True,
        )
    _create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    receipt_columns = _columns("receipts")
    if "total_cents" not in receipt_columns:
        op.add_column("receipts", sa.Column("total_cents", sa.Integer(), nullable=True))
        op.execute("UPDATE receipts SET total_cents = ROUND(total * 100)")
        with op.batch_alter_table("receipts") as batch:
            batch.alter_column("total_cents", existing_type=sa.Integer(), nullable=False)
            batch.drop_column("total")
    if "ck_receipts_total_nonnegative" not in _checks("receipts"):
        with op.batch_alter_table("receipts") as batch:
            batch.create_check_constraint(
                "ck_receipts_total_nonnegative",
                "total_cents >= 0",
            )
    if str(
        next(
            column["type"]
            for column in sa.inspect(op.get_bind()).get_columns("receipts")
            if column["name"] == "date"
        )
    ).upper() not in {"DATE"}:
        # A generic SQLite CAST of an ISO date returns only its year.
        # Copy without CAST so the complete ISO value survives under DATE affinity.
        op.execute("ALTER TABLE receipts ADD COLUMN date_value DATE")
        op.execute("UPDATE receipts SET date_value = date")
        op.execute("ALTER TABLE receipts DROP COLUMN date")
        op.execute("ALTER TABLE receipts RENAME COLUMN date_value TO date")
    with op.batch_alter_table("receipts") as batch:
        batch.alter_column("date", existing_type=sa.Date(), nullable=False)
    _create_index("ix_receipts_user_id", "receipts", ["user_id"])
    _create_index("ix_receipts_user_date", "receipts", ["user_id", "date"])

    item_columns = _columns("receipt_items")
    if "unit" not in item_columns:
        op.add_column(
            "receipt_items",
            sa.Column("unit", sa.String(), nullable=False, server_default="kg"),
        )
    if "price_cents" not in item_columns:
        op.add_column(
            "receipt_items",
            sa.Column("price_cents", sa.Integer(), nullable=True),
        )
        op.execute("UPDATE receipt_items SET price_cents = ROUND(price * 100)")
        with op.batch_alter_table("receipt_items") as batch:
            batch.alter_column("price_cents", existing_type=sa.Integer(), nullable=False)
            batch.drop_column("price")
    if "ck_receipt_items_price_nonnegative" not in _checks("receipt_items"):
        with op.batch_alter_table("receipt_items") as batch:
            batch.create_check_constraint(
                "ck_receipt_items_price_nonnegative",
                "price_cents >= 0",
            )
    _create_index("ix_receipt_items_receipt_id", "receipt_items", ["receipt_id"])

    if "provider" not in _columns("subscriptions"):
        op.add_column(
            "subscriptions",
            sa.Column(
                "provider",
                sa.String(),
                nullable=False,
                server_default="legacy",
            ),
        )
        op.execute(
            "UPDATE subscriptions SET provider = 'yookassa' WHERE purchase_token LIKE 'yookassa:%'"
        )
    op.execute(
        "INSERT INTO subscriptions "
        "(id, user_id, purchase_token, product_id, provider, active, expires_at, created_at) "
        "SELECT lower(hex(randomblob(16))), users.id, 'legacy:' || users.id, "
        "'premium_legacy', 'legacy', 1, users.subscription_expires, CURRENT_TIMESTAMP "
        "FROM users WHERE users.premium = 1 AND users.subscription_expires IS NOT NULL "
        "AND NOT EXISTS ("
        "SELECT 1 FROM subscriptions WHERE subscriptions.user_id = users.id"
        ")"
    )
    op.execute(
        "UPDATE subscriptions SET purchase_token = 'legacy:' || id "
        "WHERE id NOT IN ("
        "SELECT MIN(id) FROM subscriptions GROUP BY purchase_token"
        ")"
    )
    _create_index(
        "ux_subscriptions_purchase_token",
        "subscriptions",
        ["purchase_token"],
        unique=True,
    )
    if "ck_subscriptions_provider" not in _checks("subscriptions"):
        with op.batch_alter_table("subscriptions") as batch:
            batch.create_check_constraint(
                "ck_subscriptions_provider",
                "provider IN ('yookassa', 'google_play', 'legacy')",
            )

    _create_index("ix_devices_user_device", "devices", ["user_id", "device_id"])
    _create_index(
        "ix_ai_reports_user_created",
        "ai_reports",
        ["user_id", "created_at"],
    )
    _create_index(
        "ix_payments_user_status_created",
        "subcription_in_process",
        ["user_id", "status", "created_at"],
    )
    if "ck_payment_status" not in _checks("subcription_in_process"):
        with op.batch_alter_table("subcription_in_process") as batch:
            batch.create_check_constraint(
                "ck_payment_status",
                "status IN ('in_progress', 'rejected', 'success')",
            )
    _create_index(
        "ix_ai_cache_lookup",
        "ai_cache",
        ["user_id", "action", "context_hash", "question_hash", "expires_at"],
    )

    if "rate_limit_buckets" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "rate_limit_buckets",
            sa.Column("bucket_key", sa.String(), nullable=False),
            sa.Column("request_count", sa.Integer(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("bucket_key"),
        )
        op.create_index(
            "ix_rate_limit_buckets_expires_at",
            "rate_limit_buckets",
            ["expires_at"],
        )


def downgrade() -> None:
    if "rate_limit_buckets" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("rate_limit_buckets")

    for name, table in (
        ("ix_ai_cache_lookup", "ai_cache"),
        ("ix_payments_user_status_created", "subcription_in_process"),
        ("ix_ai_reports_user_created", "ai_reports"),
        ("ix_devices_user_device", "devices"),
        ("ux_subscriptions_purchase_token", "subscriptions"),
        ("ix_receipt_items_receipt_id", "receipt_items"),
        ("ix_receipts_user_date", "receipts"),
        ("ix_receipts_user_id", "receipts"),
        ("ix_refresh_tokens_user_id", "refresh_tokens"),
    ):
        if name in _indexes(table):
            op.drop_index(name, table_name=table)

    if "provider" in _columns("subscriptions"):
        op.drop_column("subscriptions", "provider")

    if "price_cents" in _columns("receipt_items"):
        op.add_column("receipt_items", sa.Column("price", sa.Float(), nullable=True))
        op.execute("UPDATE receipt_items SET price = price_cents / 100.0")
        with op.batch_alter_table("receipt_items") as batch:
            batch.drop_column("price_cents")
            batch.drop_column("unit")
            batch.alter_column("price", existing_type=sa.Float(), nullable=False)

    if "total_cents" in _columns("receipts"):
        op.add_column("receipts", sa.Column("total", sa.Float(), nullable=True))
        op.execute("UPDATE receipts SET total = total_cents / 100.0")
        with op.batch_alter_table("receipts") as batch:
            batch.drop_column("total_cents")
            batch.alter_column("total", existing_type=sa.Float(), nullable=False)

    if "token_hash" in _columns("refresh_tokens"):
        op.add_column(
            "refresh_tokens",
            sa.Column("token", sa.String(), nullable=False, server_default="invalidated"),
        )
        with op.batch_alter_table("refresh_tokens") as batch:
            batch.drop_column("token_hash")

    if "code_hash" in _columns("email_codes_storage"):
        op.add_column(
            "email_codes_storage",
            sa.Column("code", sa.String(), nullable=False, server_default="invalidated"),
        )
        with op.batch_alter_table("email_codes_storage") as batch:
            batch.drop_column("code_hash")

    if "auth_version" in _columns("users"):
        op.drop_column("users", "auth_version")
