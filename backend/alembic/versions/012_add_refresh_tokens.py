"""add refresh tokens

Revision ID: 012_add_refresh_tokens
Revises: 011_add_is_admin_to_users
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "012_add_refresh_tokens"
down_revision = "011_add_is_admin_to_users"
branch_labels = None
depends_on = None


def _has_index_on_columns(indexes: list[dict[str, object]], columns: list[str]) -> bool:
    for index in indexes:
        index_columns = index.get("column_names") or []
        if list(index_columns) == columns:
            return True
    return False


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("refresh_tokens"):
        op.create_table(
            "refresh_tokens",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("last_used_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token_hash"),
        )

    indexes = inspector.get_indexes("refresh_tokens")

    if not _has_index_on_columns(indexes, ["user_id"]):
        op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False)
    if not _has_index_on_columns(indexes, ["expires_at"]):
        op.create_index(op.f("ix_refresh_tokens_expires_at"), "refresh_tokens", ["expires_at"], unique=False)
    if not _has_index_on_columns(indexes, ["revoked_at"]):
        op.create_index(op.f("ix_refresh_tokens_revoked_at"), "refresh_tokens", ["revoked_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("refresh_tokens"):
        indexes = {index["name"] for index in inspector.get_indexes("refresh_tokens")}
        if op.f("ix_refresh_tokens_user_id") in indexes:
            op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
        if op.f("ix_refresh_tokens_revoked_at") in indexes:
            op.drop_index(op.f("ix_refresh_tokens_revoked_at"), table_name="refresh_tokens")
        if op.f("ix_refresh_tokens_expires_at") in indexes:
            op.drop_index(op.f("ix_refresh_tokens_expires_at"), table_name="refresh_tokens")
        op.drop_table("refresh_tokens")
