"""migrate allocation targets to buckets

Revision ID: 015_migrate_allocation_targets_to_buckets
Revises: 014_add_multi_market_asset_fields
Create Date: 2026-04-08
"""

from alembic import op
import sqlalchemy as sa


revision = "015_migrate_allocation_targets_to_buckets"
down_revision = "014_add_multi_market_asset_fields"
branch_labels = None
depends_on = None


ALLOCATION_BUCKET_ENUM = sa.Enum(
    "STOCK_BR",
    "STOCK_US",
    "ETF_INTL",
    "FII",
    "RF",
    name="allocationbucket",
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("allocation_targets")}

    if "allocation_bucket" not in existing_columns:
        op.add_column(
            "allocation_targets",
            sa.Column("allocation_bucket", ALLOCATION_BUCKET_ENUM, nullable=True),
        )

    op.execute(
        """
        UPDATE allocation_targets
        SET allocation_bucket = CASE asset_class
            WHEN 'ACAO' THEN 'STOCK_BR'
            WHEN 'STOCK' THEN 'STOCK_US'
            WHEN 'FII' THEN 'FII'
            WHEN 'RF' THEN 'RF'
            ELSE allocation_bucket
        END
        """
    )

    op.alter_column(
        "allocation_targets",
        "allocation_bucket",
        existing_type=ALLOCATION_BUCKET_ENUM,
        nullable=False,
    )

    if "asset_class" in existing_columns:
        op.drop_column("allocation_targets", "asset_class")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("allocation_targets")}

    legacy_enum = sa.Enum("STOCK", "ACAO", "FII", "RF", name="assettype")

    if "asset_class" not in existing_columns:
        op.add_column(
            "allocation_targets",
            sa.Column("asset_class", legacy_enum, nullable=True),
        )

    op.execute(
        """
        UPDATE allocation_targets
        SET asset_class = CASE allocation_bucket
            WHEN 'STOCK_BR' THEN 'ACAO'
            WHEN 'STOCK_US' THEN 'STOCK'
            WHEN 'ETF_BR' THEN 'ACAO'
            WHEN 'ETF_INTL' THEN 'STOCK'
            WHEN 'FII' THEN 'FII'
            WHEN 'RF' THEN 'RF'
            ELSE asset_class
        END
        """
    )

    op.alter_column(
        "allocation_targets",
        "asset_class",
        existing_type=legacy_enum,
        nullable=False,
    )

    if "allocation_bucket" in {col["name"] for col in inspector.get_columns("allocation_targets")}:
        op.drop_column("allocation_targets", "allocation_bucket")
