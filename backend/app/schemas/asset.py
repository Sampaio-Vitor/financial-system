from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.asset import AssetType


class AssetCreate(BaseModel):
    ticker: str
    type: AssetType
    description: str = ""


class AssetUpdate(BaseModel):
    ticker: str | None = None
    description: str | None = None


class AssetResponse(BaseModel):
    id: int
    ticker: str
    type: AssetType
    description: str
    current_price: Decimal | None
    price_updated_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
