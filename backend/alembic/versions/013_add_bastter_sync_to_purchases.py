"""add bastter sync marker to purchases

Revision ID: 013_add_bastter_sync_to_purchases
Revises: 012_add_refresh_tokens
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "013_add_bastter_sync_to_purchases"
down_revision = "8a91e505b090"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("purchases")}

    if "bastter_synced_at" not in existing_columns:
        op.add_column(
            "purchases",
            sa.Column("bastter_synced_at", sa.DateTime(), nullable=True),
        )

    indexes = {index["name"] for index in inspector.get_indexes("purchases")}
    index_name = op.f("ix_purchases_bastter_synced_at")
    if index_name not in indexes:
        op.create_index(index_name, "purchases", ["bastter_synced_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("purchases")}
    index_name = op.f("ix_purchases_bastter_synced_at")
    if index_name in indexes:
        op.drop_index(index_name, table_name="purchases")

    existing_columns = {col["name"] for col in inspector.get_columns("purchases")}
    if "bastter_synced_at" in existing_columns:
        op.drop_column("purchases", "bastter_synced_at")
