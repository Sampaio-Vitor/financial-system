from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class FixedIncomeCreate(BaseModel):
    asset_id: int
    description: str
    start_date: date
    applied_value: Decimal
    current_balance: Decimal
    yield_value: Decimal = Decimal("0")
    yield_pct: Decimal = Decimal("0")
    maturity_date: date | None = None


class FixedIncomeUpdate(BaseModel):
    description: str | None = None
    applied_value: Decimal | None = None
    current_balance: Decimal | None = None
    yield_value: Decimal | None = None
    yield_pct: Decimal | None = None
    maturity_date: date | None = None


class FixedIncomeResponse(BaseModel):
    id: int
    asset_id: int
    description: str
    start_date: date
    applied_value: Decimal
    current_balance: Decimal
    yield_value: Decimal
    yield_pct: Decimal
    maturity_date: date | None
    created_at: datetime
    updated_at: datetime
    ticker: str | None = None

    model_config = {"from_attributes": True}
