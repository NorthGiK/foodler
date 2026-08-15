"""Add durable receipt category snapshots and assignment cache.

Revision ID: e7f8a9b0c123
Revises: b6e7f8a9c012
"""

import re

import sqlalchemy as sa

from alembic import op

revision = "e7f8a9b0c123"  # pragma: allowlist secret
down_revision = "b6e7f8a9c012"  # pragma: allowlist secret
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "products" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("products")}
        if "normalized_name" not in columns:
            op.add_column(
                "products",
                sa.Column("normalized_name", sa.String(), nullable=False, server_default=""),
            )
            connection = op.get_bind()
            rows = connection.execute(sa.text("SELECT id, name FROM products")).mappings()
            for row in rows:
                normalized = re.sub(r"[^\w\s%.\\/\\-]", "", row["name"].lower().strip())
                normalized = re.sub(r"\s+", " ", normalized).strip()
                connection.execute(
                    sa.text("UPDATE products SET normalized_name = :normalized WHERE id = :id"),
                    {"normalized": normalized, "id": row["id"]},
                )
            op.create_index("ix_products_normalized_name", "products", ["normalized_name"])
            with op.batch_alter_table("products") as batch:
                batch.alter_column("normalized_name", server_default=None)
    if "receipt_items" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("receipt_items")}
        additions = (
            ("category", sa.String(), "прочее", False),
            ("category_source", sa.String(), "fallback", False),
            ("category_confidence", sa.Float(), "0", False),
            ("category_taxonomy_version", sa.String(), "v1", False),
            ("category_model_version", sa.String(), None, True),
        )
        for name, column_type, default, nullable in additions:
            if name not in columns:
                op.add_column(
                    "receipt_items",
                    sa.Column(name, column_type, nullable=nullable, server_default=default),
                )
    op.create_table(
        "product_category_assignments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("key_type", sa.String(), nullable=False),
        sa.Column("lookup_key", sa.String(), nullable=False),
        sa.Column("merchant_scope", sa.String(), nullable=False, server_default=""),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("taxonomy_version", sa.String(), nullable=False, server_default="v1"),
        sa.Column("model_version", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default="confirmed"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "key_type", "lookup_key", "merchant_scope", name="uq_category_assignment_key"
        ),
    )
    op.create_index(
        "ix_category_assignment_lookup",
        "product_category_assignments",
        ["key_type", "lookup_key", "merchant_scope"],
    )


def downgrade() -> None:
    op.drop_index("ix_category_assignment_lookup", table_name="product_category_assignments")
    op.drop_table("product_category_assignments")
    for name in (
        "category_model_version",
        "category_taxonomy_version",
        "category_confidence",
        "category_source",
        "category",
    ):
        op.drop_column("receipt_items", name)
    op.drop_index("ix_products_normalized_name", table_name="products")
    op.drop_column("products", "normalized_name")
