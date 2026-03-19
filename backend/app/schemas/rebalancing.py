from decimal import Decimal

from pydantic import BaseModel

from app.models.asset import AssetType


class ClassRebalancing(BaseModel):
    asset_class: AssetType
    label: str
    target_pct: Decimal
    current_pct: Decimal
    current_value: Decimal
    target_value: Decimal
    gap: Decimal
    gap_pct: Decimal
    status: str  # "APORTAR" or "ACIMA DO ALVO"


class AssetRebalancing(BaseModel):
    ticker: str
    asset_class: AssetType
    current_value: Decimal
    target_value: Decimal
    gap: Decimal
    gap_pct: Decimal
    amount_to_invest: Decimal
    amount_to_invest_usd: Decimal | None = None


class RebalancingResponse(BaseModel):
    contribution: Decimal
    patrimonio_atual: Decimal
    patrimonio_pos_aporte: Decimal
    reserva_valor: Decimal
    reserva_target: Decimal | None
    reserva_gap: Decimal | None
    class_breakdown: list[ClassRebalancing]
    asset_plan: list[AssetRebalancing]
    total_planned: Decimal
