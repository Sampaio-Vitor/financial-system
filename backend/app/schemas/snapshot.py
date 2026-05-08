from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel

from app.models.asset import AllocationBucket, AssetClass, CurrencyCode, Market


class SnapshotGenerateRequest(BaseModel):
    month: str  # YYYY-MM


class SnapshotResponse(BaseModel):
    id: int
    month: str
    total_patrimonio: Decimal
    total_invested: Decimal
    total_pnl: Decimal
    pnl_pct: Decimal
    aportes_do_mes: Decimal
    allocation_breakdown: Any | None = None
    snapshot_at: datetime


class SnapshotAssetItem(BaseModel):
    ticker: str
    type: str
    asset_class: AssetClass | None = None
    market: Market | None = None
    quote_currency: CurrencyCode | None = None
    allocation_bucket: AllocationBucket | None = None
    quantity: float
    avg_price: float
    avg_price_native: float | None = None
    closing_price: float | None = None
    closing_price_native: float | None = None
    fx_rate_to_brl: float | None = None
    market_value: float | None = None
    total_cost: float
    pnl: float | None = None
    pnl_pct: float | None = None


class PatrimonioEvolutionPoint(BaseModel):
    month: str
    total_patrimonio: Decimal
    total_invested: Decimal
    total_pnl: Decimal
    pnl_pct: Decimal
    aportes_do_mes: Decimal


class DailyEvolutionPoint(BaseModel):
    date: date
    total_patrimonio: Decimal
    total_invested: Decimal
    total_pnl: Decimal
    pnl_pct: Decimal


class MoverItem(BaseModel):
    asset_id: int
    ticker: str
    description: str | None = None
    asset_class: str | None = None
    market: str | None = None
    position_value: float
    pnl_period_brl: float
    pnl_period_pct: float
    contribution_pct: float
    net_contributions_brl: float
    dividends_brl: float


class MoversResponse(BaseModel):
    period: str
    reference_date: date
    period_start_date: date
    total_patrimonio: float
    total_period_pnl: float
    winners: list[MoverItem]
    losers: list[MoverItem]
