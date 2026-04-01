"""add is_admin to users

Revision ID: 011_add_is_admin_to_users
Revises: 010_add_purchase_native_currency_fields
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa

revision = "011_add_is_admin_to_users"
down_revision = "010_add_purchase_native_currency_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "is_admin")
