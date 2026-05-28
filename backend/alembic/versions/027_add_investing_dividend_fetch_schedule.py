"""add investing dividend fetch schedule fields

Revision ID: 027_add_investing_dividend_fetch_schedule
Revises: 026_add_investing_dividend_calendar
Create Date: 2026-05-28
"""

from alembic import op
import sqlalchemy as sa


revision = "027_add_investing_dividend_fetch_schedule"
down_revision = "026_add_investing_dividend_calendar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column("investing_dividends_fetched_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column("investing_dividends_next_fetch_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column(
            "investing_dividends_failure_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "assets",
        sa.Column(
            "investing_dividends_last_error", sa.String(length=500), nullable=True
        ),
    )
    op.create_index(
        op.f("ix_assets_investing_dividends_next_fetch_at"),
        "assets",
        ["investing_dividends_next_fetch_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_assets_investing_dividends_next_fetch_at"), table_name="assets"
    )
    op.drop_column("assets", "investing_dividends_last_error")
    op.drop_column("assets", "investing_dividends_failure_count")
    op.drop_column("assets", "investing_dividends_next_fetch_at")
    op.drop_column("assets", "investing_dividends_fetched_at")
