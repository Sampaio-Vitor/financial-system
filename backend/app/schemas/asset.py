from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.models.asset import AssetType


class AssetCreate(BaseModel):
    ticker: str
    type: AssetType
    description: str = ""


class AssetUpdate(BaseModel):
    ticker: str | None = None
    description: str | None = None


class BulkAssetItem(BaseModel):
    ticker: str
    type: AssetType


class BulkAssetRequest(BaseModel):
    assets: list[BulkAssetItem]

    @field_validator("assets")
    @classmethod
    def validate_assets(cls, v: list[BulkAssetItem]) -> list[BulkAssetItem]:
        if not v:
            raise ValueError("Lista de ativos vazia")
        if len(v) > 200:
            raise ValueError("Máximo de 200 ativos por importação")
        return v


class BulkAssetCreated(BaseModel):
    ticker: str
    type: AssetType


class BulkAssetSkipped(BaseModel):
    ticker: str
    reason: str


class BulkAssetResponse(BaseModel):
    created: list[BulkAssetCreated]
    skipped: list[BulkAssetSkipped]


class AssetResponse(BaseModel):
    id: int
    ticker: str
    type: AssetType
    description: str
    current_price: Decimal | None
    price_updated_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
