from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class FinancialReserveCreate(BaseModel):
    amount: Decimal
    note: str | None = None
    recorded_at: datetime | None = None


class FinancialReserveUpdate(BaseModel):
    amount: Decimal | None = None
    note: str | None = None
    recorded_at: datetime | None = None


class FinancialReserveResponse(BaseModel):
    id: int
    amount: Decimal
    note: str | None
    recorded_at: datetime

    model_config = {"from_attributes": True}


class FinancialReserveMonthValue(BaseModel):
    month: str
    amount: Decimal | None
    entry: FinancialReserveResponse | None


class FinancialReserveTargetUpdate(BaseModel):
    target_amount: Decimal


class FinancialReserveTargetResponse(BaseModel):
    target_amount: Decimal | None
