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
