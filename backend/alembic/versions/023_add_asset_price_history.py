"""add asset price history cache

Revision ID: 023_add_asset_price_history
Revises: 022_add_asset_daily_snapshots
Create Date: 2026-05-27
"""

from alembic import op
import sqlalchemy as sa


revision = "023_add_asset_price_history"
down_revision = "022_add_asset_daily_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "asset_price_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("yf_ticker", sa.String(length=32), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("price_native", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("fx_rate_to_brl", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("price_brl", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column(
            "quote_currency",
            sa.Enum("BRL", "USD", "EUR", "GBP", name="currencycode"),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "asset_id", "date", name="uq_asset_price_history_asset_date"
        ),
    )
    op.create_index(
        op.f("ix_asset_price_history_asset_id"),
        "asset_price_history",
        ["asset_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_price_history_date"),
        "asset_price_history",
        ["date"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_price_history_yf_ticker"),
        "asset_price_history",
        ["yf_ticker"],
        unique=False,
    )
    op.create_index(
        "ix_asset_price_history_asset_date",
        "asset_price_history",
        ["asset_id", "date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_asset_price_history_asset_date", table_name="asset_price_history")
    op.drop_index(
        op.f("ix_asset_price_history_yf_ticker"), table_name="asset_price_history"
    )
    op.drop_index(op.f("ix_asset_price_history_date"), table_name="asset_price_history")
    op.drop_index(
        op.f("ix_asset_price_history_asset_id"), table_name="asset_price_history"
    )
    op.drop_table("asset_price_history")
