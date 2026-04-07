from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, field_validator


class BastterSyncRequest(BaseModel):
    purchase_ids: list[int]
    cookie: str

    @field_validator("purchase_ids")
    @classmethod
    def validate_purchase_ids(cls, value: list[int]) -> list[int]:
        normalized = [purchase_id for purchase_id in value if purchase_id > 0]
        if not normalized:
            raise ValueError("Selecione ao menos uma movimentacao")
        return normalized

    @field_validator("cookie")
    @classmethod
    def validate_cookie(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Informe o cookie da sessao do Bastter")
        return normalized


class BastterSyncItemResult(BaseModel):
    purchase_id: int
    ticker: str
    local_type: str
    bastter_tipo: str
    ativo_id: int | None = None
    endpoint: str | None = None
    payload: dict[str, Any] | None = None
    success: bool
    bastter_response: dict[str, Any] | None = None
    error: str | None = None
    bastter_synced_at: datetime | None = None


class BastterSyncBatchResponse(BaseModel):
    catalog_items_count: int
    selected_count: int
    success_count: int
    failure_count: int
    results: list[BastterSyncItemResult]


class BastterSyncPreviewItem(BaseModel):
    id: int
    ticker: str
    asset_type: str
    purchase_date: str
    quantity: Decimal
    total_value: Decimal
    total_value_native: Decimal
    trade_currency: str
    bastter_synced_at: datetime | None


class BastterSyncPreviewResponse(BaseModel):
    items: list[BastterSyncPreviewItem]
    total_count: int
