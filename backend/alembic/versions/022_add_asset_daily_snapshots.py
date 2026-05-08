"""add asset_daily_snapshots table

Revision ID: 022_add_asset_daily_snapshots
Revises: 021_add_bastter_sync_to_fixed_income
Create Date: 2026-05-08
"""

from alembic import op
import sqlalchemy as sa


revision = "022_add_asset_daily_snapshots"
down_revision = "021_add_bastter_sync_to_fixed_income"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "asset_daily_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("price_brl", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("quantity", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("position_value", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("invested_cost", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column(
            "asset_class",
            sa.Enum("STOCK", "ETF", "FII", "RF", name="assetclass"),
            nullable=True,
        ),
        sa.Column(
            "market",
            sa.Enum("BR", "US", "EU", "UK", name="market"),
            nullable=True,
        ),
        sa.Column("ticker", sa.String(length=20), nullable=False),
        sa.Column("snapshot_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "asset_id",
            "date",
            name="uq_asset_daily_snapshot_user_asset_date",
        ),
    )
    op.create_index(
        op.f("ix_asset_daily_snapshots_user_id"),
        "asset_daily_snapshots",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_daily_snapshots_asset_id"),
        "asset_daily_snapshots",
        ["asset_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_daily_snapshots_date"),
        "asset_daily_snapshots",
        ["date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_asset_daily_snapshots_date"), table_name="asset_daily_snapshots"
    )
    op.drop_index(
        op.f("ix_asset_daily_snapshots_asset_id"),
        table_name="asset_daily_snapshots",
    )
    op.drop_index(
        op.f("ix_asset_daily_snapshots_user_id"),
        table_name="asset_daily_snapshots",
    )
    op.drop_table("asset_daily_snapshots")
