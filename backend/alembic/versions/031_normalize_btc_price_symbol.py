"""normalize BTC CoinGecko price symbol

Revision ID: 031_normalize_btc_price_symbol
Revises: 030_add_crypto_enums
Create Date: 2026-06-05
"""
from typing import Sequence, Union

from alembic import op


revision: str = "031_normalize_btc_price_symbol"
down_revision: Union[str, None] = "030_add_crypto_enums"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE assets
        SET ticker = 'BTC',
            price_symbol = 'bitcoin',
            type = 'CRYPTO',
            asset_class = 'CRYPTO',
            market = 'CRYPTO',
            quote_currency = 'BRL'
        WHERE UPPER(ticker) = 'BTC'
          AND (type = 'CRYPTO' OR asset_class = 'CRYPTO' OR market = 'CRYPTO')
        """
    )


def downgrade() -> None:
    # Intentionally no-op: restoring an invalid provider symbol would reintroduce
    # failed CoinGecko calls.
    pass
