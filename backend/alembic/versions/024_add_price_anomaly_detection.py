"""add price anomaly detection fields

Revision ID: 024_add_price_anomaly_detection
Revises: 023_add_asset_price_history
Create Date: 2026-05-27
"""

from alembic import op
import sqlalchemy as sa


revision = "024_add_price_anomaly_detection"
down_revision = "023_add_asset_price_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "asset_price_history",
        sa.Column("low_native", sa.Numeric(precision=18, scale=6), nullable=True),
    )
    op.add_column(
        "asset_price_history",
        sa.Column("high_native", sa.Numeric(precision=18, scale=6), nullable=True),
    )
    op.add_column(
        "asset_price_history",
        sa.Column("low_brl", sa.Numeric(precision=18, scale=4), nullable=True),
    )
    op.add_column(
        "asset_price_history",
        sa.Column("high_brl", sa.Numeric(precision=18, scale=4), nullable=True),
    )

    op.create_table(
        "purchase_price_anomaly_ignores",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("purchase_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("ignored_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["purchase_id"], ["purchases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "purchase_id", name="uq_purchase_price_anomaly_ignore_purchase"
        ),
    )
    op.create_index(
        op.f("ix_purchase_price_anomaly_ignores_purchase_id"),
        "purchase_price_anomaly_ignores",
        ["purchase_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_purchase_price_anomaly_ignores_user_id"),
        "purchase_price_anomaly_ignores",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_purchase_price_anomaly_ignores_user_id"),
        table_name="purchase_price_anomaly_ignores",
    )
    op.drop_index(
        op.f("ix_purchase_price_anomaly_ignores_purchase_id"),
        table_name="purchase_price_anomaly_ignores",
    )
    op.drop_table("purchase_price_anomaly_ignores")
    op.drop_column("asset_price_history", "high_brl")
    op.drop_column("asset_price_history", "low_brl")
    op.drop_column("asset_price_history", "high_native")
    op.drop_column("asset_price_history", "low_native")
