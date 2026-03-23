"""add user_assets join table, migrate paused from assets

Revision ID: 004_add_user_assets
Revises: 003_add_asset_paused
Create Date: 2026-03-23
"""
import sqlalchemy as sa
from alembic import op

revision = "004_add_user_assets"
down_revision = "003_add_asset_paused"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create user_assets table
    op.create_table(
        "user_assets",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("asset_id", sa.Integer, sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("paused", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("user_id", "asset_id"),
    )
    op.create_index("ix_user_assets_user_id", "user_assets", ["user_id"])
    op.create_index("ix_user_assets_asset_id", "user_assets", ["asset_id"])

    # 2. Populate from purchases + fixed_income_positions (assets user has interacted with)
    op.execute(
        """
        INSERT INTO user_assets (user_id, asset_id, paused, created_at)
        SELECT DISTINCT sub.user_id, sub.asset_id, a.paused, NOW()
        FROM (
            SELECT user_id, asset_id FROM purchases
            UNION
            SELECT user_id, asset_id FROM fixed_income_positions
        ) sub
        JOIN assets a ON a.id = sub.asset_id
        """
    )

    # 3. Handle orphaned assets (no purchases from anyone):
    #    If there is exactly 1 user, assign all orphaned assets to that user.
    op.execute(
        """
        INSERT INTO user_assets (user_id, asset_id, paused, created_at)
        SELECT u.id, a.id, a.paused, NOW()
        FROM assets a
        CROSS JOIN (SELECT id FROM users LIMIT 1) u
        WHERE a.id NOT IN (SELECT asset_id FROM user_assets)
        AND (SELECT COUNT(*) FROM users) = 1
        """
    )

    # 4. Drop paused column from assets
    op.drop_column("assets", "paused")


def downgrade() -> None:
    # 1. Re-add paused column to assets
    op.add_column("assets", sa.Column("paused", sa.Boolean, nullable=False, server_default=sa.text("false")))

    # 2. Copy paused state back (use any user's value — best effort)
    op.execute(
        """
        UPDATE assets a
        JOIN user_assets ua ON ua.asset_id = a.id AND ua.paused = 1
        SET a.paused = 1
        """
    )

    # 3. Drop user_assets table
    op.drop_index("ix_user_assets_asset_id", "user_assets")
    op.drop_index("ix_user_assets_user_id", "user_assets")
    op.drop_table("user_assets")
