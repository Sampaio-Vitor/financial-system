"""add retirement goals table

Revision ID: 017_add_retirement_goals
Revises: 016_add_native_currency_to_saved_plan_items
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa

revision = "017_add_retirement_goals"
down_revision = "016_add_native_currency_to_saved_plan_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "retirement_goals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("patrimonio_meta", sa.Numeric(18, 4), nullable=False),
        sa.Column("taxa_retirada", sa.Numeric(5, 2), nullable=False, server_default="4.00"),
        sa.Column("rentabilidade_anual", sa.Numeric(5, 2), nullable=False, server_default="8.00"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("retirement_goals")
