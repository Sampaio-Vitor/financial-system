"""add asset paused column

Revision ID: 003_add_asset_paused
Revises: 002_add_whitelist_tables
Create Date: 2026-03-22
"""
import sqlalchemy as sa
from alembic import op

revision = "003_add_asset_paused"
down_revision = "002_add_whitelist_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("assets", sa.Column("paused", sa.Boolean, nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("assets", "paused")
