"""add user_id indexes

Revision ID: 001_add_user_id_indexes
Revises:
Create Date: 2026-03-20
"""
from alembic import op

revision = "001_add_user_id_indexes"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(op.f("ix_purchases_user_id"), "purchases", ["user_id"])
    op.create_index(op.f("ix_fixed_income_positions_user_id"), "fixed_income_positions", ["user_id"])
    op.create_index(op.f("ix_fixed_income_interest_user_id"), "fixed_income_interest", ["user_id"])
    op.create_index(op.f("ix_fixed_income_redemptions_user_id"), "fixed_income_redemptions", ["user_id"])
    op.create_index(op.f("ix_allocation_targets_user_id"), "allocation_targets", ["user_id"])
    op.create_index(op.f("ix_financial_reserve_entries_user_id"), "financial_reserve_entries", ["user_id"])
    op.create_index(op.f("ix_monthly_snapshots_user_id"), "monthly_snapshots", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_monthly_snapshots_user_id"), table_name="monthly_snapshots")
    op.drop_index(op.f("ix_financial_reserve_entries_user_id"), table_name="financial_reserve_entries")
    op.drop_index(op.f("ix_allocation_targets_user_id"), table_name="allocation_targets")
    op.drop_index(op.f("ix_fixed_income_redemptions_user_id"), table_name="fixed_income_redemptions")
    op.drop_index(op.f("ix_fixed_income_interest_user_id"), table_name="fixed_income_interest")
    op.drop_index(op.f("ix_fixed_income_positions_user_id"), table_name="fixed_income_positions")
    op.drop_index(op.f("ix_purchases_user_id"), table_name="purchases")
