"""add tesouro fields to assets

Revision ID: 019_add_tesouro_fields_to_assets
Revises: 018_add_target_pct_to_user_assets
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa


revision = "019_add_tesouro_fields_to_assets"
down_revision = "018_add_target_pct_to_user_assets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assets",
        sa.Column(
            "td_kind",
            sa.Enum("SELIC", "IPCA+", name="tesourokind"),
            nullable=True,
        ),
    )
    op.add_column(
        "assets",
        sa.Column("td_maturity_year", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("assets", "td_maturity_year")
    op.drop_column("assets", "td_kind")
    sa.Enum(name="tesourokind").drop(op.get_bind(), checkfirst=True)
