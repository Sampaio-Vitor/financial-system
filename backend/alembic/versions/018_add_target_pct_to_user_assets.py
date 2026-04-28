"""add target_pct to user_assets

Revision ID: 018_add_target_pct_to_user_assets
Revises: 017_add_retirement_goals
Create Date: 2026-04-28
"""

from alembic import op
import sqlalchemy as sa

revision = "018_add_target_pct_to_user_assets"
down_revision = "017_add_retirement_goals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_assets",
        sa.Column("target_pct", sa.Numeric(5, 4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_assets", "target_pct")
