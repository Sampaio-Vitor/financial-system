"""add multi-market asset fields

Revision ID: 014_add_multi_market_asset_fields
Revises: 013_add_bastter_sync_to_purchases
Create Date: 2026-04-08
"""

from alembic import op
import sqlalchemy as sa


revision = "014_add_multi_market_asset_fields"
down_revision = "013_add_bastter_sync_to_purchases"
branch_labels = None
depends_on = None


ASSET_CLASS_ENUM = sa.Enum("STOCK", "ETF", "FII", "RF", name="assetclass")
MARKET_ENUM = sa.Enum("BR", "US", "EU", "UK", name="market")
CURRENCY_ENUM = sa.Enum("BRL", "USD", "EUR", "GBP", name="currencycode")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("assets")}

    if "asset_class" not in existing_columns:
        op.add_column("assets", sa.Column("asset_class", ASSET_CLASS_ENUM, nullable=True))
    if "market" not in existing_columns:
        op.add_column("assets", sa.Column("market", MARKET_ENUM, nullable=True))
    if "quote_currency" not in existing_columns:
        op.add_column("assets", sa.Column("quote_currency", CURRENCY_ENUM, nullable=True))
    if "price_symbol" not in existing_columns:
        op.add_column("assets", sa.Column("price_symbol", sa.String(length=32), nullable=True))
    if "current_price_native" not in existing_columns:
        op.add_column("assets", sa.Column("current_price_native", sa.Numeric(18, 6), nullable=True))
    if "fx_rate_to_brl" not in existing_columns:
        op.add_column("assets", sa.Column("fx_rate_to_brl", sa.Numeric(18, 6), nullable=True))

    op.execute(
        """
        UPDATE assets
        SET
            asset_class = CASE type
                WHEN 'STOCK' THEN 'STOCK'
                WHEN 'ACAO' THEN 'STOCK'
                WHEN 'FII' THEN 'FII'
                WHEN 'RF' THEN 'RF'
                ELSE asset_class
            END,
            market = CASE type
                WHEN 'STOCK' THEN 'US'
                WHEN 'ACAO' THEN 'BR'
                WHEN 'FII' THEN 'BR'
                WHEN 'RF' THEN 'BR'
                ELSE market
            END,
            quote_currency = CASE type
                WHEN 'STOCK' THEN 'USD'
                WHEN 'ACAO' THEN 'BRL'
                WHEN 'FII' THEN 'BRL'
                WHEN 'RF' THEN 'BRL'
                ELSE quote_currency
            END,
            price_symbol = CASE type
                WHEN 'STOCK' THEN ticker
                WHEN 'ACAO' THEN CONCAT(ticker, '.SA')
                WHEN 'FII' THEN CONCAT(ticker, '.SA')
                ELSE price_symbol
            END
        """
    )

    op.execute(
        """
        UPDATE assets
        SET
            current_price_native = current_price,
            fx_rate_to_brl = 1
        WHERE quote_currency = 'BRL' AND current_price IS NOT NULL
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("assets")}

    if "fx_rate_to_brl" in existing_columns:
        op.drop_column("assets", "fx_rate_to_brl")
    if "current_price_native" in existing_columns:
        op.drop_column("assets", "current_price_native")
    if "price_symbol" in existing_columns:
        op.drop_column("assets", "price_symbol")
    if "quote_currency" in existing_columns:
        op.drop_column("assets", "quote_currency")
    if "market" in existing_columns:
        op.drop_column("assets", "market")
    if "asset_class" in existing_columns:
        op.drop_column("assets", "asset_class")
