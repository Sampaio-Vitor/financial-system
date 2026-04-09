from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.models.asset import AssetClass, AssetType, CurrencyCode, Market


class PurchaseCreate(BaseModel):
    asset_id: int
    purchase_date: date
    quantity: Decimal
    unit_price: Decimal | None = None
    trade_currency: Literal["BRL", "USD", "EUR", "GBP"] | None = None
    unit_price_native: Decimal | None = None
    fx_rate: Decimal | None = None


class PurchaseUpdate(BaseModel):
    purchase_date: date | None = None
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    trade_currency: Literal["BRL", "USD", "EUR", "GBP"] | None = None
    unit_price_native: Decimal | None = None
    fx_rate: Decimal | None = None


class PurchaseResponse(BaseModel):
    id: int
    asset_id: int
    purchase_date: date
    quantity: Decimal
    trade_currency: Literal["BRL", "USD", "EUR", "GBP"]
    unit_price: Decimal
    total_value: Decimal
    unit_price_native: Decimal
    total_value_native: Decimal
    fx_rate: Decimal
    created_at: datetime
    ticker: str | None = None
    asset_type: AssetType | None = None
    asset_class: AssetClass | None = None
    market: Market | None = None
    quote_currency: CurrencyCode | None = None

    model_config = {"from_attributes": True}


class PurchasePageResponse(BaseModel):
    items: list[PurchaseResponse]
    total_count: int
    page: int
    page_size: int
    total_pages: int
    total_value: Decimal
