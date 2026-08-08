"""Add a per-user fingerprint used for receipt idempotency."""

from alembic import op
import sqlalchemy as sa

revision = "a2d3f4e5b607"
down_revision = "f1c4a9d2e706"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("receipts", sa.Column("source_fingerprint", sa.String(), nullable=True))
    op.create_index("ix_receipts_source_fingerprint", "receipts", ["source_fingerprint"])
    op.create_unique_constraint(
        "uq_receipts_user_source_fingerprint",
        "receipts",
        ["user_id", "source_fingerprint"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_receipts_user_source_fingerprint", "receipts", type_="unique")
    op.drop_index("ix_receipts_source_fingerprint", table_name="receipts")
    op.drop_column("receipts", "source_fingerprint")
