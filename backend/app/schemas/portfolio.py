from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.models.asset import AssetType
from app.schemas.purchase import PurchaseResponse


class FixedIncomeTransactionItem(BaseModel):
    ticker: str
    description: str
    date: date
    amount: Decimal


class PositionItem(BaseModel):
    asset_id: int
    ticker: str
    description: str
    type: AssetType
    first_date: str | None
    quantity: Decimal
    total_cost: Decimal
    avg_price: Decimal
    current_price: Decimal | None
    market_value: Decimal | None
    pnl: Decimal | None
    pnl_pct: Decimal | None


class ClassSummary(BaseModel):
    asset_class: AssetType
    label: str
    value: Decimal
    pct: Decimal
    target_pct: Decimal
    gap: Decimal


class DailyPatrimonio(BaseModel):
    day: int
    value: Decimal


class MonthlyOverview(BaseModel):
    month: str
    min_month: str | None
    patrimonio_total: Decimal
    reserva_financeira: Decimal | None
    reserva_target: Decimal | None
    total_invested: Decimal
    aportes_do_mes: Decimal
    resgates_do_mes: Decimal
    variacao_mes: Decimal
    variacao_mes_pct: Decimal
    allocation_breakdown: list[ClassSummary]
    daily_patrimonio: list[DailyPatrimonio]
    transactions: list[PurchaseResponse]
    fi_aportes: list[FixedIncomeTransactionItem]
    fi_redemptions: list[FixedIncomeTransactionItem]
    fi_interest: list[FixedIncomeTransactionItem]
    reserva_depositos: Decimal
    reserva_resgates: Decimal


class PositionsResponse(BaseModel):
    asset_class: AssetType
    positions: list[PositionItem]
    total_cost: Decimal
    total_market_value: Decimal
    total_pnl: Decimal
    total_pnl_pct: Decimal | None
