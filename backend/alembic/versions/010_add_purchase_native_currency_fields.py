"""add native currency fields to purchases

Revision ID: 010_add_purchase_native_currency_fields
Revises: 009_add_dividend_events
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa

revision = "010_add_purchase_native_currency_fields"
down_revision = "009_add_dividend_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("purchases")}

    if "trade_currency" not in existing_columns:
        op.add_column(
            "purchases",
            sa.Column("trade_currency", sa.String(length=3), nullable=False, server_default="BRL"),
        )
    if "unit_price_native" not in existing_columns:
        op.add_column(
            "purchases",
            sa.Column("unit_price_native", sa.Numeric(18, 4), nullable=True),
        )
    if "total_value_native" not in existing_columns:
        op.add_column(
            "purchases",
            sa.Column("total_value_native", sa.Numeric(18, 4), nullable=True),
        )
    if "fx_rate" not in existing_columns:
        op.add_column(
            "purchases",
            sa.Column("fx_rate", sa.Numeric(10, 4), nullable=False, server_default="1"),
        )

    op.execute(
        """
        UPDATE purchases
        SET
            trade_currency = 'BRL',
            unit_price_native = unit_price,
            total_value_native = total_value,
            fx_rate = 1
        """
    )

    op.alter_column(
        "purchases",
        "unit_price_native",
        existing_type=sa.Numeric(18, 4),
        nullable=False,
    )
    op.alter_column(
        "purchases",
        "total_value_native",
        existing_type=sa.Numeric(18, 4),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("purchases", "fx_rate")
    op.drop_column("purchases", "total_value_native")
    op.drop_column("purchases", "unit_price_native")
    op.drop_column("purchases", "trade_currency")
