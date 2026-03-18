from decimal import Decimal

from pydantic import BaseModel

from app.models.asset import AssetType


class AllocationTargetItem(BaseModel):
    asset_class: AssetType
    target_pct: Decimal


class AllocationTargetsUpdate(BaseModel):
    targets: list[AllocationTargetItem]


class AllocationTargetResponse(BaseModel):
    asset_class: AssetType
    target_pct: Decimal

    model_config = {"from_attributes": True}
