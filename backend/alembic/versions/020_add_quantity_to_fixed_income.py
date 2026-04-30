"""add quantity to fixed_income_positions

Revision ID: 020_add_quantity_to_fixed_income
Revises: 019_add_tesouro_fields_to_assets
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa


revision = "020_add_quantity_to_fixed_income"
down_revision = "019_add_tesouro_fields_to_assets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "fixed_income_positions",
        sa.Column("quantity", sa.Numeric(18, 8), nullable=True),
    )
    op.add_column(
        "fixed_income_positions",
        sa.Column("purchase_unit_price", sa.Numeric(18, 4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("fixed_income_positions", "purchase_unit_price")
    op.drop_column("fixed_income_positions", "quantity")
