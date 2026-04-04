"""add_daily_snapshots

Revision ID: 8a91e505b090
Revises: 012_add_refresh_tokens
Create Date: 2026-04-04 11:46:13.651564
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '8a91e505b090'
down_revision: Union[str, None] = '012_add_refresh_tokens'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('daily_snapshots',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('total_patrimonio', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('total_invested', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('total_pnl', sa.Numeric(precision=18, scale=4), nullable=False),
    sa.Column('pnl_pct', sa.Numeric(precision=8, scale=4), nullable=False),
    sa.Column('snapshot_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'date', name='uq_daily_snapshot_user_date')
    )
    op.create_index(op.f('ix_daily_snapshots_date'), 'daily_snapshots', ['date'], unique=False)
    op.create_index(op.f('ix_daily_snapshots_user_id'), 'daily_snapshots', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_daily_snapshots_user_id'), table_name='daily_snapshots')
    op.drop_index(op.f('ix_daily_snapshots_date'), table_name='daily_snapshots')
    op.drop_table('daily_snapshots')
