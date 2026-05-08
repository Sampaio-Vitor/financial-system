from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, field_validator

from app.models.asset import AssetClass, Market

ItemSource = Literal["purchase", "fixed_income"]


class BastterSyncRequest(BaseModel):
    purchase_ids: list[int] = []
    fixed_income_position_ids: list[int] = []
    cookie: str

    @field_validator("purchase_ids", "fixed_income_position_ids")
    @classmethod
    def validate_ids(cls, value: list[int]) -> list[int]:
        return [item_id for item_id in value if item_id > 0]

    @field_validator("cookie")
    @classmethod
    def validate_cookie(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Informe o cookie da sessao do Bastter")
        return normalized

    def has_any(self) -> bool:
        return bool(self.purchase_ids or self.fixed_income_position_ids)


class BastterSyncItemResult(BaseModel):
    purchase_id: int
    source: ItemSource = "purchase"
    ticker: str
    local_type: str
    asset_class: AssetClass | None = None
    market: Market | None = None
    bastter_tipo: str
    ativo_id: int | None = None
    endpoint: str | None = None
    payload: dict[str, Any] | None = None
    success: bool
    bastter_response: dict[str, Any] | None = None
    error: str | None = None
    bastter_synced_at: datetime | None = None
    missing_in_catalog: bool = False


class BastterSyncBatchResponse(BaseModel):
    catalog_items_count: int
    selected_count: int
    success_count: int
    failure_count: int
    missing_in_catalog_count: int = 0
    results: list[BastterSyncItemResult]


class BastterIncludeAssetsRequest(BaseModel):
    purchase_ids: list[int] = []
    fixed_income_position_ids: list[int] = []
    cookie: str

    @field_validator("purchase_ids", "fixed_income_position_ids")
    @classmethod
    def validate_ids(cls, value: list[int]) -> list[int]:
        return [item_id for item_id in value if item_id > 0]

    @field_validator("cookie")
    @classmethod
    def validate_cookie(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Informe o cookie da sessao do Bastter")
        return normalized


class BastterIncludeAssetResult(BaseModel):
    ticker: str
    bastter_tipo: str
    success: bool
    bastter_response: dict[str, Any] | None = None
    error: str | None = None


class BastterIncludeAssetsResponse(BaseModel):
    carteira_id: int
    success_count: int
    failure_count: int
    results: list[BastterIncludeAssetResult]


class BastterSyncPreviewItem(BaseModel):
    id: int
    source: ItemSource = "purchase"
    ticker: str
    asset_type: str
    asset_class: AssetClass | None = None
    market: Market | None = None
    purchase_date: str
    quantity: Decimal
    total_value: Decimal
    total_value_native: Decimal
    trade_currency: str
    bastter_synced_at: datetime | None


class BastterSyncPreviewResponse(BaseModel):
    items: list[BastterSyncPreviewItem]
    total_count: int
