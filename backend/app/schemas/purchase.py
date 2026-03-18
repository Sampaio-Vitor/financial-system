from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.asset import AssetType


class PurchaseCreate(BaseModel):
    asset_id: int
    purchase_date: date
    quantity: Decimal
    unit_price: Decimal


class PurchaseUpdate(BaseModel):
    purchase_date: date | None = None
    quantity: Decimal | None = None
    unit_price: Decimal | None = None


class PurchaseResponse(BaseModel):
    id: int
    asset_id: int
    purchase_date: date
    quantity: Decimal
    unit_price: Decimal
    total_value: Decimal
    created_at: datetime
    ticker: str | None = None
    asset_type: AssetType | None = None

    model_config = {"from_attributes": True}
