"""remove unsupported subscription providers

Revision ID: d4b7a9c2e610
Revises: c9a2e7714f30
Create Date: 2026-08-02 10:00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d4b7a9c2e610"  # pragma: allowlist secret
down_revision: str | Sequence[str] | None = "c9a2e7714f30"  # pragma: allowlist secret
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The removed provider was never exposed by the mobile purchase flow. Clear
    # any such entitlement and its compatibility cache instead of silently
    # converting an unverifiable purchase into another provider.
    op.execute(
        "UPDATE users SET premium = 0, subscription_expires = NULL "
        "WHERE id IN ("
        "SELECT user_id FROM subscriptions "
        "WHERE provider NOT IN ('yookassa', 'legacy')"
        ")"
    )
    op.execute(
        "DELETE FROM subscriptions WHERE provider NOT IN ('yookassa', 'legacy')"
    )
    with op.batch_alter_table("subscriptions") as batch:
        batch.drop_constraint("ck_subscriptions_provider", type_="check")
        batch.create_check_constraint(
            "ck_subscriptions_provider",
            "provider IN ('yookassa', 'legacy')",
        )


def downgrade() -> None:
    # Deleted provider entitlements cannot be reconstructed safely. The
    # downgrade only loosens the constraint for schema compatibility.
    with op.batch_alter_table("subscriptions") as batch:
        batch.drop_constraint("ck_subscriptions_provider", type_="check")
        batch.create_check_constraint(
            "ck_subscriptions_provider",
            "length(provider) > 0",
        )
