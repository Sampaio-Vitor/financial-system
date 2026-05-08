"""add bastter sync marker to fixed income positions

Revision ID: 021_add_bastter_sync_to_fixed_income
Revises: 020_add_quantity_to_fixed_income
Create Date: 2026-05-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "021_add_bastter_sync_to_fixed_income"
down_revision = "020_add_quantity_to_fixed_income"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("fixed_income_positions")}

    if "bastter_synced_at" not in existing_columns:
        op.add_column(
            "fixed_income_positions",
            sa.Column("bastter_synced_at", sa.DateTime(), nullable=True),
        )

    indexes = {index["name"] for index in inspector.get_indexes("fixed_income_positions")}
    index_name = op.f("ix_fixed_income_positions_bastter_synced_at")
    if index_name not in indexes:
        op.create_index(index_name, "fixed_income_positions", ["bastter_synced_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("fixed_income_positions")}
    index_name = op.f("ix_fixed_income_positions_bastter_synced_at")
    if index_name in indexes:
        op.drop_index(index_name, table_name="fixed_income_positions")

    existing_columns = {col["name"] for col in inspector.get_columns("fixed_income_positions")}
    if "bastter_synced_at" in existing_columns:
        op.drop_column("fixed_income_positions", "bastter_synced_at")
