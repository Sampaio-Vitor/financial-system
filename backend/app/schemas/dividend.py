from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class DividendEventResponse(BaseModel):
    id: int
    transaction_id: int | None
    asset_id: int | None
    ticker: str | None
    asset_type: str | None = None
    asset_class: str | None = None
    market: str | None = None
    event_type: str
    source: str
    status: str
    credited_amount: Decimal
    gross_amount: Decimal | None
    withholding_tax: Decimal | None
    quantity_base: Decimal | None
    amount_per_unit: Decimal | None
    ex_date: date | None
    declared_currency: str | None
    amount_per_unit_native: Decimal | None
    gross_amount_native: Decimal | None
    withholding_tax_native: Decimal | None
    credited_amount_native: Decimal | None
    fx_rate_to_brl: Decimal | None
    payment_date: date
    description: str
    source_category: str | None
    source_confidence: str
    created_at: datetime


class DividendEventListResponse(BaseModel):
    events: list[DividendEventResponse]
    total_count: int


class AssetYieldItem(BaseModel):
    asset_id: int
    ticker: str
    market_value: Decimal
    dividends_12m: Decimal
    dividends_annualized: Decimal
    yield_pct: Decimal | None
    yield_on_cost_pct: Decimal | None
    months_held: int
    is_annualized: bool


class DividendYieldResponse(BaseModel):
    portfolio_market_value: Decimal
    portfolio_dividends_12m: Decimal
    portfolio_dividends_annualized: Decimal
    portfolio_yield_pct: Decimal | None
    portfolio_yield_on_cost_pct: Decimal | None
    assets: list[AssetYieldItem]
