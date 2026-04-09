from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import String, DateTime, Numeric, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AssetType(str, PyEnum):
    STOCK = "STOCK"
    ACAO = "ACAO"
    FII = "FII"
    RF = "RF"


class AssetClass(str, PyEnum):
    STOCK = "STOCK"
    ETF = "ETF"
    FII = "FII"
    RF = "RF"


class Market(str, PyEnum):
    BR = "BR"
    US = "US"
    EU = "EU"
    UK = "UK"


class CurrencyCode(str, PyEnum):
    BRL = "BRL"
    USD = "USD"
    EUR = "EUR"
    GBP = "GBP"


class AllocationBucket(str, PyEnum):
    STOCK_BR = "STOCK_BR"
    STOCK_US = "STOCK_US"
    ETF_INTL = "ETF_INTL"
    FII = "FII"
    RF = "RF"


LEGACY_TYPE_TO_METADATA: dict[AssetType, tuple[AssetClass, Market, CurrencyCode]] = {
    AssetType.STOCK: (AssetClass.STOCK, Market.US, CurrencyCode.USD),
    AssetType.ACAO: (AssetClass.STOCK, Market.BR, CurrencyCode.BRL),
    AssetType.FII: (AssetClass.FII, Market.BR, CurrencyCode.BRL),
    AssetType.RF: (AssetClass.RF, Market.BR, CurrencyCode.BRL),
}


def asset_bucket_for(asset_class: AssetClass, market: Market) -> AllocationBucket:
    if asset_class == AssetClass.RF:
        return AllocationBucket.RF
    if asset_class == AssetClass.FII:
        return AllocationBucket.FII
    if asset_class == AssetClass.STOCK:
        return AllocationBucket.STOCK_BR if market == Market.BR else AllocationBucket.STOCK_US
    if asset_class == AssetClass.ETF:
        return AllocationBucket.STOCK_BR if market == Market.BR else AllocationBucket.ETF_INTL
    raise ValueError(f"Unsupported asset class/market combination: {asset_class}/{market}")


def asset_bucket_from_legacy_type(asset_type: AssetType) -> AllocationBucket:
    asset_class, market, _quote_currency = LEGACY_TYPE_TO_METADATA[asset_type]
    return asset_bucket_for(asset_class, market)


def legacy_type_for(asset_class: AssetClass, market: Market) -> AssetType:
    if asset_class == AssetClass.RF:
        return AssetType.RF
    if asset_class == AssetClass.FII:
        return AssetType.FII
    if market == Market.BR:
        return AssetType.ACAO
    return AssetType.STOCK


def resolve_asset_metadata(
    *,
    legacy_type: AssetType,
    asset_class: AssetClass | None,
    market: Market | None,
    quote_currency: CurrencyCode | None,
) -> tuple[AssetClass, Market, CurrencyCode]:
    if asset_class is not None and market is not None and quote_currency is not None:
        return asset_class, market, quote_currency
    return LEGACY_TYPE_TO_METADATA[legacy_type]


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    type: Mapped[AssetType] = mapped_column(Enum(AssetType), nullable=False)
    asset_class: Mapped[Optional[AssetClass]] = mapped_column(Enum(AssetClass), nullable=True)
    market: Mapped[Optional[Market]] = mapped_column(Enum(Market), nullable=True)
    quote_currency: Mapped[Optional[CurrencyCode]] = mapped_column(Enum(CurrencyCode), nullable=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    price_symbol: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    current_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4), nullable=True)
    current_price_native: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    fx_rate_to_brl: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6), nullable=True)
    price_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
