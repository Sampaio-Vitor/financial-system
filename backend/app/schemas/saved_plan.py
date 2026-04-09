from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

class SavedPlanItemOut(BaseModel):
    id: int
    ticker: str
    asset_class: str
    current_value: Decimal
    target_value: Decimal
    gap: Decimal
    amount_to_invest: Decimal
    amount_to_invest_usd: Decimal | None = None
    amount_to_invest_native: Decimal | None = None
    quote_currency: str | None = None
    is_reserve: bool
    checked: bool

    model_config = ConfigDict(from_attributes=True)


class SavedPlanOut(BaseModel):
    id: int
    label: str
    contribution: Decimal
    patrimonio_atual: Decimal
    patrimonio_pos_aporte: Decimal
    reserva_valor: Decimal
    reserva_target: Decimal | None
    reserva_gap: Decimal | None
    total_planned: Decimal
    class_breakdown_json: str
    created_at: datetime
    items: list[SavedPlanItemOut]

    model_config = ConfigDict(from_attributes=True)


class SavedPlanSummary(BaseModel):
    id: int
    label: str
    contribution: Decimal
    total_planned: Decimal
    created_at: datetime
    items_count: int
    checked_count: int
    checked_amount: Decimal


class SavePlanRequest(BaseModel):
    label: str
    contribution: Decimal
    patrimonio_atual: Decimal
    patrimonio_pos_aporte: Decimal
    reserva_valor: Decimal
    reserva_target: Decimal | None = None
    reserva_gap: Decimal | None = None
    total_planned: Decimal
    class_breakdown_json: str
    items: list["SavePlanItemRequest"]


class SavePlanItemRequest(BaseModel):
    ticker: str
    asset_class: str
    current_value: Decimal
    target_value: Decimal
    gap: Decimal
    amount_to_invest: Decimal
    amount_to_invest_usd: Decimal | None = None
    amount_to_invest_native: Decimal | None = None
    quote_currency: str | None = None
    is_reserve: bool = False


class UpdateChecksRequest(BaseModel):
    checked_item_ids: list[int]
