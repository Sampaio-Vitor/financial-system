"""recategorize same-person transfers as 'Transferência interna'

Revision ID: 006_internal_transfers
Revises: 005_add_expenses_tables
Create Date: 2026-03-24
"""
from alembic import op

revision = "006_internal_transfers"
down_revision = "005_add_expenses_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE transactions SET category = 'Transferência interna' "
        "WHERE pluggy_category = 'Same person transfer'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE transactions SET category = 'Transferências' "
        "WHERE pluggy_category = 'Same person transfer'"
    )
