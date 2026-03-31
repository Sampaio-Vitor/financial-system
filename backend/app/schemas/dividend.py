from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class DividendEventResponse(BaseModel):
    id: int
    transaction_id: int
    asset_id: int | None
    ticker: str | None
    asset_type: str | None = None
    event_type: str
    credited_amount: Decimal
    gross_amount: Decimal | None
    withholding_tax: Decimal | None
    quantity_base: Decimal | None
    amount_per_unit: Decimal | None
    payment_date: date
    description: str
    source_category: str | None
    source_confidence: str
    created_at: datetime


class DividendEventListResponse(BaseModel):
    events: list[DividendEventResponse]
    total_count: int
