"""add whitelist tables

Revision ID: 002_add_whitelist_tables
Revises: 001_add_user_id_indexes
Create Date: 2026-03-20
"""
import sqlalchemy as sa
from alembic import op

revision = "002_add_whitelist_tables"
down_revision = "001_add_user_id_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "allowed_usernames",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(50), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("key", sa.String(100), unique=True, nullable=False),
        sa.Column("value", sa.String(255), nullable=False),
    )

    # Seed default setting: whitelist disabled
    op.execute(
        "INSERT INTO system_settings (`key`, `value`) VALUES ('registration_whitelist_enabled', 'false')"
    )


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_table("allowed_usernames")
