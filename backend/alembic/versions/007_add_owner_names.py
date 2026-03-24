"""add owner_names to pluggy_credentials

Revision ID: 007_add_owner_names
Revises: 006_internal_transfers
Create Date: 2026-03-24
"""
import sqlalchemy as sa
from alembic import op

revision = "007_add_owner_names"
down_revision = "006_internal_transfers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pluggy_credentials", sa.Column("owner_names", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("pluggy_credentials", "owner_names")
