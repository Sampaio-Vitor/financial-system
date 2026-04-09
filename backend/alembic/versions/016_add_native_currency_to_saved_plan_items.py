"""add native currency fields to saved plan items

Revision ID: 016_add_native_currency_to_saved_plan_items
Revises: 015_migrate_allocation_targets_to_buckets
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa


revision = "016_add_native_currency_to_saved_plan_items"
down_revision = "015_migrate_allocation_targets_to_buckets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("saved_plan_items")}

    if "amount_to_invest_native" not in existing_columns:
        op.add_column(
            "saved_plan_items",
            sa.Column("amount_to_invest_native", sa.Numeric(18, 4), nullable=True),
        )
    if "quote_currency" not in existing_columns:
        op.add_column(
            "saved_plan_items",
            sa.Column("quote_currency", sa.String(length=3), nullable=True),
        )

    op.execute(
        """
        UPDATE saved_plan_items
        SET
            amount_to_invest_native = amount_to_invest_usd,
            quote_currency = 'USD'
        WHERE amount_to_invest_usd IS NOT NULL
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("saved_plan_items")}

    if "quote_currency" in existing_columns:
        op.drop_column("saved_plan_items", "quote_currency")
    if "amount_to_invest_native" in existing_columns:
        op.drop_column("saved_plan_items", "amount_to_invest_native")
