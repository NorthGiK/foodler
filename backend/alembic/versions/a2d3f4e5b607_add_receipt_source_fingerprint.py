"""Add a per-user fingerprint used for receipt idempotency."""

import sqlalchemy as sa

from alembic import op

revision = "a2d3f4e5b607"
down_revision = "f1c4a9d2e706"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite cannot ALTER TABLE to add a constraint. Batch mode rebuilds the
    # table while preserving rows and existing constraints.
    inspector = sa.inspect(op.get_bind())
    column_names = {column["name"] for column in inspector.get_columns("receipts")}
    with op.batch_alter_table("receipts") as batch_op:
        if "source_fingerprint" not in column_names:
            batch_op.add_column(sa.Column("source_fingerprint", sa.String(), nullable=True))
        batch_op.create_unique_constraint(
            "uq_receipts_user_source_fingerprint",
            ["user_id", "source_fingerprint"],
        )
    indexes = {index["name"] for index in inspector.get_indexes("receipts")}
    if "ix_receipts_source_fingerprint" not in indexes:
        op.create_index("ix_receipts_source_fingerprint", "receipts", ["source_fingerprint"])


def downgrade() -> None:
    op.drop_index("ix_receipts_source_fingerprint", table_name="receipts")
    with op.batch_alter_table("receipts") as batch_op:
        batch_op.drop_constraint("uq_receipts_user_source_fingerprint", type_="unique")
        batch_op.drop_column("source_fingerprint")
