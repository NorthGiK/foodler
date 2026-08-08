"""Add canonical product categories and GTIN mappings."""

import sqlalchemy as sa

from alembic import op

revision = "d5e6f7a8b910"
down_revision = "c4d5e6f7a809"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "products" not in inspector.get_table_names():
        from src.models import Product, ProductAlias, ProductBarcode, ProductTag, ProductTagMember

        for model in (Product, ProductTag, ProductAlias, ProductTagMember, ProductBarcode):
            model.__table__.create(op.get_bind(), checkfirst=True)
        if "receipt_items" in inspector.get_table_names():
            columns = {column["name"] for column in inspector.get_columns("receipt_items")}
            if "gtin" not in columns:
                op.add_column("receipt_items", sa.Column("gtin", sa.String(), nullable=True))
                op.create_index("ix_receipt_items_gtin", "receipt_items", ["gtin"])
        return
    op.add_column("products", sa.Column("category", sa.String(), nullable=False, server_default="прочее"))
    op.add_column("receipt_items", sa.Column("gtin", sa.String(), nullable=True))
    op.create_index("ix_receipt_items_gtin", "receipt_items", ["gtin"])
    op.create_table(
        "product_barcodes",
        sa.Column("gtin", sa.String(), primary_key=True),
        sa.Column("product_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
    )
    op.create_index("ix_product_barcodes_product_id", "product_barcodes", ["product_id"])
    for category, tags in {
        "молочные": ("молочка", "кисломолочка", "сыр", "творог"),
        "мясо": ("мясо",), "рыба": ("рыба", "морепродукты"),
        "овощи": ("овощи",), "фрукты": ("фрукты",),
        "бакалея": ("бакалея",), "хлеб": ("хлеб",),
        "напитки": ("напитки",), "заморозка": ("заморозка",),
    }.items():
        placeholders = ", ".join(f"'{tag}'" for tag in tags)
        op.execute(sa.text(f"UPDATE products SET category = '{category}' WHERE id IN (SELECT ptm.product_id FROM product_tag_members ptm JOIN product_tags pt ON pt.id = ptm.tag_id WHERE pt.name IN ({placeholders}))"))


def downgrade() -> None:
    op.drop_index("ix_product_barcodes_product_id", table_name="product_barcodes")
    op.drop_table("product_barcodes")
    op.drop_index("ix_receipt_items_gtin", table_name="receipt_items")
    op.drop_column("receipt_items", "gtin")
    op.drop_column("products", "category")
