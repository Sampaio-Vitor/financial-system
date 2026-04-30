from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator, model_validator

from app.models.asset import AssetClass, AssetType, CurrencyCode, Market, TesouroKind


class AssetCreate(BaseModel):
    ticker: str | None = None
    type: AssetType | None = None
    asset_class: AssetClass | None = None
    market: Market | None = None
    quote_currency: CurrencyCode | None = None
    price_symbol: str | None = None
    description: str = ""
    td_kind: TesouroKind | None = None
    td_maturity_year: int | None = None

    @model_validator(mode="after")
    def validate_classification(self) -> "AssetCreate":
        has_legacy = self.type is not None
        has_new_shape = (
            self.asset_class is not None
            and self.market is not None
            and self.quote_currency is not None
        )
        if not has_legacy and not has_new_shape:
            raise ValueError(
                "Informe o tipo legado ou asset_class + market + quote_currency"
            )
        if (self.td_kind is None) != (self.td_maturity_year is None):
            raise ValueError("td_kind e td_maturity_year devem ser informados juntos")
        if self.td_maturity_year is not None and not (2025 <= self.td_maturity_year <= 2100):
            raise ValueError("td_maturity_year fora do intervalo plausível")
        if self.td_kind is None and not self.ticker:
            raise ValueError("Ticker obrigatório")
        return self


class AssetUpdate(BaseModel):
    ticker: str | None = None
    description: str | None = None
    paused: bool | None = None
    target_pct: Decimal | None = None
    asset_class: AssetClass | None = None
    market: Market | None = None
    quote_currency: CurrencyCode | None = None
    price_symbol: str | None = None

    @field_validator("target_pct")
    @classmethod
    def _validate_target_pct(cls, v: Decimal | None) -> Decimal | None:
        if v is None:
            return v
        if v < 0 or v > 1:
            raise ValueError("target_pct deve estar entre 0 e 1")
        return v


class BulkAssetItem(BaseModel):
    ticker: str
    type: AssetType | None = None
    asset_class: AssetClass | None = None
    market: Market | None = None
    quote_currency: CurrencyCode | None = None
    price_symbol: str | None = None

    @model_validator(mode="after")
    def validate_classification(self) -> "BulkAssetItem":
        has_legacy = self.type is not None
        has_new_shape = (
            self.asset_class is not None
            and self.market is not None
            and self.quote_currency is not None
        )
        if not has_legacy and not has_new_shape:
            raise ValueError(
                "Informe o tipo legado ou asset_class + market + quote_currency"
            )
        return self


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
    type: AssetType | None = None
    asset_class: AssetClass | None = None
    market: Market | None = None
    quote_currency: CurrencyCode | None = None


class BulkAssetLinked(BaseModel):
    ticker: str
    type: AssetType | None = None
    asset_class: AssetClass | None = None
    market: Market | None = None
    quote_currency: CurrencyCode | None = None


class BulkAssetSkipped(BaseModel):
    ticker: str
    reason: str


class BulkAssetResponse(BaseModel):
    created: list[BulkAssetCreated]
    linked: list[BulkAssetLinked]
    skipped: list[BulkAssetSkipped]


class AssetResponse(BaseModel):
    id: int
    ticker: str
    type: AssetType
    asset_class: AssetClass | None = None
    market: Market | None = None
    quote_currency: CurrencyCode | None = None
    description: str
    paused: bool
    target_pct: Decimal | None = None
    price_symbol: str | None = None
    current_price: Decimal | None
    current_price_native: Decimal | None = None
    fx_rate_to_brl: Decimal | None = None
    price_updated_at: datetime | None
    td_kind: TesouroKind | None = None
    td_maturity_year: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AssetRebalancingInfo(BaseModel):
    asset_id: int
    ticker: str
    target_value: Decimal
    current_value: Decimal
    gap: Decimal
