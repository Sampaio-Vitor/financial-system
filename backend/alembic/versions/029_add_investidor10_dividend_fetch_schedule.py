"""add investidor10 dividend fetch schedule fields

Revision ID: 029_add_investidor10_dividend_fetch_schedule
Revises: 028_add_push_subscriptions
Create Date: 2026-05-29
"""

from alembic import op
import sqlalchemy as sa


revision = "029_add_investidor10_dividend_fetch_schedule"
down_revision = "028_add_push_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column("investidor10_dividends_fetched_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column("investidor10_dividends_next_fetch_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column(
            "investidor10_dividends_failure_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "assets",
        sa.Column(
            "investidor10_dividends_last_error", sa.String(length=500), nullable=True
        ),
    )
    op.create_index(
        op.f("ix_assets_investidor10_dividends_next_fetch_at"),
        "assets",
        ["investidor10_dividends_next_fetch_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_assets_investidor10_dividends_next_fetch_at"), table_name="assets"
    )
    op.drop_column("assets", "investidor10_dividends_last_error")
    op.drop_column("assets", "investidor10_dividends_failure_count")
    op.drop_column("assets", "investidor10_dividends_next_fetch_at")
    op.drop_column("assets", "investidor10_dividends_fetched_at")
