"""add CRYPTO value to mysql enums for BTC support

Revision ID: 030_add_crypto_enums
Revises: 029_add_investidor10_dividend_fetch_schedule
Create Date: 2026-06-05
"""
from typing import Sequence, Union

from alembic import op


revision: str = "030_add_crypto_enums"
down_revision: Union[str, None] = "029_add_investidor10_dividend_fetch_schedule"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # assets.type: add CRYPTO (preserves legacy RESERVA value that exists in the
    # MySQL enum but is not declared in the Python model)
    op.execute(
        "ALTER TABLE assets MODIFY COLUMN type "
        "ENUM('STOCK','ACAO','FII','RF','RESERVA','CRYPTO') NOT NULL"
    )

    # assets.asset_class: add CRYPTO
    op.execute(
        "ALTER TABLE assets MODIFY COLUMN asset_class "
        "ENUM('STOCK','ETF','FII','RF','CRYPTO') NULL"
    )

    # assets.market: add CRYPTO
    op.execute(
        "ALTER TABLE assets MODIFY COLUMN market "
        "ENUM('BR','US','EU','UK','CRYPTO') NULL"
    )

    # allocation_targets.allocation_bucket: add CRYPTO (preserves legacy ETF_BR
    # value that exists in the MySQL enum but is not declared in the Python model)
    op.execute(
        "ALTER TABLE allocation_targets MODIFY COLUMN allocation_bucket "
        "ENUM('STOCK_BR','STOCK_US','ETF_BR','ETF_INTL','FII','RF','CRYPTO') NOT NULL"
    )

    # asset_daily_snapshots.asset_class: add CRYPTO
    op.execute(
        "ALTER TABLE asset_daily_snapshots MODIFY COLUMN asset_class "
        "ENUM('STOCK','ETF','FII','RF','CRYPTO') NULL"
    )

    # asset_daily_snapshots.market: add CRYPTO
    op.execute(
        "ALTER TABLE asset_daily_snapshots MODIFY COLUMN market "
        "ENUM('BR','US','EU','UK','CRYPTO') NULL"
    )


def downgrade() -> None:
    # Restoration to the pre-CRYPTO enum values is potentially destructive if
    # CRYPTO rows already exist. The downgrade preserves existing data by keeping
    # historical values that were present before this migration ran, but removes
    # CRYPTO. If CRYPTO rows exist, the downgrade will fail — this is intentional.
    # Manual data cleanup would be required before downgrading past this point.

    op.execute(
        "ALTER TABLE assets MODIFY COLUMN type "
        "ENUM('STOCK','ACAO','FII','RF','RESERVA') NOT NULL"
    )

    op.execute(
        "ALTER TABLE assets MODIFY COLUMN asset_class "
        "ENUM('STOCK','ETF','FII','RF') NULL"
    )

    op.execute(
        "ALTER TABLE assets MODIFY COLUMN market "
        "ENUM('BR','US','EU','UK') NULL"
    )

    op.execute(
        "ALTER TABLE allocation_targets MODIFY COLUMN allocation_bucket "
        "ENUM('STOCK_BR','STOCK_US','ETF_BR','ETF_INTL','FII','RF') NOT NULL"
    )

    op.execute(
        "ALTER TABLE asset_daily_snapshots MODIFY COLUMN asset_class "
        "ENUM('STOCK','ETF','FII','RF') NULL"
    )

    op.execute(
        "ALTER TABLE asset_daily_snapshots MODIFY COLUMN market "
        "ENUM('BR','US','EU','UK') NULL"
    )