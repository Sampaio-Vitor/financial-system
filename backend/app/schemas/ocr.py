from pydantic import BaseModel


class ExtractedOperation(BaseModel):
    ticker: str
    date: str  # YYYY-MM-DD
    quantity: float
    total_value: float
    operation_type: str  # "compra" | "venda"
    currency: str = "BRL"  # "BRL" | "USD" | "EUR" | "GBP"


class OcrResult(BaseModel):
    operations: list[ExtractedOperation]
    confidence: str  # "high" | "medium" | "low"
    notes: str | None = None


class OcrUploadResponse(BaseModel):
    batch_id: str
    job_ids: list[str]


class OcrJobStatus(BaseModel):
    job_id: str
    status: str  # "queued" | "in_progress" | "complete" | "not_found"
    result: OcrResult | None = None
    error: str | None = None


class OcrBatchStatus(BaseModel):
    batch_id: str
    status: str  # "processing" | "completed" | "failed"
    jobs: list[OcrJobStatus]


class TickerResolution(BaseModel):
    ticker: str
    asset_id: int | None = None
    quote_currency: str | None = None
    fx_rate_to_brl: float | None = None
    state: str  # "linked" | "global_unlinked" | "unknown"


class TickerResolveRequest(BaseModel):
    tickers: list[str]


class TickerResolveResponse(BaseModel):
    resolutions: list[TickerResolution]


class BulkPurchaseRequest(BaseModel):
    items: list["BulkPurchaseItem"]


class BulkPurchaseItem(BaseModel):
    asset_id: int
    purchase_date: str  # YYYY-MM-DD
    quantity: float  # negative for sales
    total_value: float
    trade_currency: str = "BRL"
    fx_rate: float | None = None
