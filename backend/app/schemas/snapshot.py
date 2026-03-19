from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel


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
    quantity: float
    avg_price: float
    closing_price: float | None = None
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
