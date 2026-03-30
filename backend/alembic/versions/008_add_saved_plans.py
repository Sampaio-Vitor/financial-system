"""add saved_plans and saved_plan_items tables

Revision ID: 008_add_saved_plans
Revises: 007_add_owner_names
Create Date: 2026-03-30
"""

from alembic import op
import sqlalchemy as sa

revision = "008_add_saved_plans"
down_revision = "007_add_owner_names"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("contribution", sa.Numeric(18, 4), nullable=False),
        sa.Column("patrimonio_atual", sa.Numeric(18, 4), nullable=False),
        sa.Column("patrimonio_pos_aporte", sa.Numeric(18, 4), nullable=False),
        sa.Column("reserva_valor", sa.Numeric(18, 4), nullable=False),
        sa.Column("reserva_target", sa.Numeric(18, 4), nullable=True),
        sa.Column("reserva_gap", sa.Numeric(18, 4), nullable=True),
        sa.Column("total_planned", sa.Numeric(18, 4), nullable=False),
        sa.Column("class_breakdown_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "saved_plan_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("saved_plans.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("ticker", sa.String(20), nullable=False),
        sa.Column("asset_class", sa.String(10), nullable=False),
        sa.Column("current_value", sa.Numeric(18, 4), nullable=False),
        sa.Column("target_value", sa.Numeric(18, 4), nullable=False),
        sa.Column("gap", sa.Numeric(18, 4), nullable=False),
        sa.Column("amount_to_invest", sa.Numeric(18, 4), nullable=False),
        sa.Column("amount_to_invest_usd", sa.Numeric(18, 4), nullable=True),
        sa.Column("is_reserve", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("checked", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_table("saved_plan_items")
    op.drop_table("saved_plans")
