"""add dividend_events table

Revision ID: 009_add_dividend_events
Revises: 008_add_saved_plans
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa

revision = "009_add_dividend_events"
down_revision = "008_add_saved_plans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dividend_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("ticker", sa.String(20), nullable=True),
        sa.Column("event_type", sa.String(20), nullable=False, server_default="UNKNOWN"),
        sa.Column("credited_amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("gross_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("withholding_tax", sa.Numeric(18, 4), nullable=True),
        sa.Column("quantity_base", sa.Numeric(18, 8), nullable=True),
        sa.Column("amount_per_unit", sa.Numeric(18, 8), nullable=True),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("source_category", sa.String(255), nullable=True),
        sa.Column("source_confidence", sa.String(10), nullable=False, server_default="low"),
        sa.Column("raw_data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("transaction_id", name="uq_dividend_event_transaction"),
    )
    op.create_index("ix_dividend_events_user_id", "dividend_events", ["user_id"])
    op.create_index("ix_dividend_events_transaction_id", "dividend_events", ["transaction_id"])
    op.create_index("ix_dividend_events_asset_id", "dividend_events", ["asset_id"])
    op.create_index("ix_dividend_events_ticker", "dividend_events", ["ticker"])
    op.create_index("ix_dividend_events_payment_date", "dividend_events", ["payment_date"])


def downgrade() -> None:
    op.drop_index("ix_dividend_events_payment_date", "dividend_events")
    op.drop_index("ix_dividend_events_ticker", "dividend_events")
    op.drop_index("ix_dividend_events_asset_id", "dividend_events")
    op.drop_index("ix_dividend_events_transaction_id", "dividend_events")
    op.drop_index("ix_dividend_events_user_id", "dividend_events")
    op.drop_table("dividend_events")
