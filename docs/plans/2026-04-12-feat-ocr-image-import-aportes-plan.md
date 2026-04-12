---
title: "feat: OCR Image Import for Aportes"
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-image-ocr-aportes-brainstorm.md
---

# feat: OCR Image Import for Aportes

## Overview

Allow users to upload one or more screenshots from their brokerage app, extract investment operations via Gemini Flash Lite, review/edit the results, and bulk-create purchases — all powered by a Redis + arq async job queue.

(see brainstorm: `docs/brainstorms/2026-04-12-image-ocr-aportes-brainstorm.md`)

## Problem Statement / Motivation

Currently, adding aportes is fully manual — the user fills out a form per operation (ticker, date, quantity, value). For users who do multiple trades per month, this is tedious. Brokerage apps show trade history in a visual format that can be extracted via vision AI, making the process dramatically faster.

## Proposed Solution

### Architecture

```
Browser                     Backend (FastAPI)              Redis        Worker (arq)         Gemini API
  │                              │                           │              │                    │
  ├─ POST /api/ocr/upload ──────►│                           │              │                    │
  │  (multipart images)          ├─ convert to base64 ───────►│              │                    │
  │                              ├─ enqueue job per image ───►│              │                    │
  │  ◄── {batch_id, job_ids} ────┤                           │              │                    │
  │                              │                           │◄─ dequeue ───┤                    │
  │                              │                           │              ├─ send image ───────►│
  │                              │                           │              │◄── structured JSON ─┤
  │                              │                           │◄─ store ─────┤                    │
  │  GET /api/ocr/batch/{batch}─►│                           │              │                    │
  │  ◄── {status, results} ──────┤◄─ read results ───────────┤              │                    │
  │                              │                           │              │                    │
  │  POST /api/purchases/bulk ──►│                           │              │                    │
  │  ◄── created purchases ──────┤                           │              │                    │
```

### Key Technical Decisions

1. **Queue:** Redis 7 Alpine + arq async worker (see brainstorm)
2. **AI Model:** Gemini Flash Lite via `google-genai` SDK (NOT the deprecated `google-generativeai`), configured by `OCR_MODEL` with a Flash-Lite default
3. **Image storage:** Base64 in-memory, no disk persistence (see brainstorm)
4. **Worker deployment:** Separate Docker container, same backend image, different entrypoint (see brainstorm)
5. **Multi-image:** Supported in v1, one job per image, results consolidated (see brainstorm)
6. **Review flow:** Editable table before saving, with inline "Add asset" for unknown tickers (see brainstorm)

## Technical Considerations

### Currency and FX Rate Handling

US stock screenshots (e.g., Avenue) show values in USD. The existing `PurchaseCreate` requires `fx_rate` + `unit_price_native` for non-BRL assets. Solution:

- Gemini prompt extracts optional `currency` field (BRL/USD/EUR/GBP) alongside other fields, but the asset's `quote_currency` is authoritative
- Backend resolves the ticker first, then uses the asset's `quote_currency` to decide whether the extracted total is native currency or BRL
- For non-BRL assets, the review screen shows an `fx_rate` column pre-filled from the asset's current `fx_rate_to_brl` (user can override)
- `unit_price`/`unit_price_native` are always derived from the reviewed total: `total_value / abs(quantity)`
- `operation_type = "venda"` is converted to a negative `quantity` before calling purchase creation, because the current purchase model represents sales with negative quantity

### Ticker Resolution (3 states in review screen)

| State | Badge | Action | Who can do it |
|---|---|---|---|
| Ticker in user's catalog | Green ✓ | Ready to import | Any user |
| Ticker exists globally, not linked | Blue "Link" | Auto-link `UserAsset` on confirm | Any user |
| Ticker unknown globally | Yellow "Not found" | "Add asset" button → creates global + links | Admin only |

For non-admin users with unknown tickers: row is disabled with message "Ativo não cadastrado no sistema."

Add a backend resolution contract before saving:

- `POST /api/ocr/resolve-tickers` accepts a list of tickers and returns `asset_id`, `ticker`, `quote_currency`, `fx_rate_to_brl`, and `resolution_state` for each row
- The endpoint must distinguish "linked to user", "global but not linked", and "unknown globally"; `GET /api/assets` cannot do this today because it only lists the user's linked catalog
- Linking a global asset should be explicit, either via a new lightweight link endpoint or by reusing a tightened asset bulk/link helper that does not require the user to guess classification metadata

### Bulk Purchase Endpoint

New `POST /api/purchases/bulk` endpoint:
- Accepts a wrapper payload containing `items: list[PurchaseCreate]` so row indexes and future metadata are explicit
- Atomic transaction — all or nothing
- Runs the same `_normalize_purchase_values` validation per item
- Returns created purchases or error identifying which row failed
- Validates sale positions using the full batch, not only the current database position, so purchases and sales inside the same batch are evaluated in order
- Requires every `asset_id` to be linked to the user before the transaction; rows in "global but not linked" state must be linked during review/confirm before purchase creation

### Image Validation

- **Allowed types:** PNG, JPG, JPEG, WebP (HEIC rejected — user can screenshot instead)
- **MVP max size:** 5MB per image
- **MVP max images:** 5 per upload
- **Server-side MIME validation** via magic bytes, not just extension
- Worker jobs must carry the validated MIME type with the image bytes; do not hardcode `image/jpeg`

Reasoning: base64 adds ~33% overhead. The original 10 images x 10MB limit could put >130MB of encoded payload into Redis before job metadata/retries.

### Duplicate Detection

Show warning badge in review screen if a purchase with matching (ticker, date, quantity, total_value) already exists. User can still proceed — it's a warning, not a block.

### Polling Strategy

- Frontend polls `GET /api/ocr/batch/{batch_id}` every 2s
- Returns status per job: `queued | processing | completed | failed`
- Batch is `completed` when all jobs are `completed` or `failed`
- **Timeout:** 120s max polling, then show error with retry button
- Job results kept in Redis for 1 hour (`keep_result=3600`)
- Batch metadata stored in Redis must include `user_id`, `job_ids`, and per-image metadata; status endpoint must reject access when `batch.user_id != current_user.id`

## Acceptance Criteria

- [x] User can upload 1-5 images via drag-and-drop or file picker on the aportes page
- [x] Each image is processed asynchronously via Redis/arq → Gemini Flash Lite
- [x] Frontend shows loading state with per-image progress
- [x] Review screen shows editable table: ticker, date, quantity, total_value, operation_type
- [x] Tickers are resolved against user's catalog with 3 states (linked / exists-unlinked / unknown)
- [x] User can add/link assets directly from the review screen
- [x] User can edit any field, delete rows, and confirm to bulk-create purchases
- [x] Purchases are created atomically via `POST /api/purchases/bulk`
- [x] Sales are converted to negative purchase quantities and validated against database position plus earlier rows in the same batch
- [ ] Duplicate detection warns on matching existing purchases
- [x] Error states handled: Gemini failure, malformed response, timeout, invalid image
- [x] Batch status is user-scoped; one user cannot poll another user's OCR batch
- [x] Multipart upload works through a frontend helper that does not force `Content-Type: application/json`
- [x] Redis + arq worker run as separate Docker containers
- [x] Works in both dev (`docker compose up`) and prod (`docker-compose.prod.yml`)

## Implementation Phases

### Phase 1: Infrastructure (Redis + arq)

**New files:**
- `backend/app/worker.py` — arq WorkerSettings + OCR task function
- `backend/app/services/ocr_service.py` — Gemini API integration
- `backend/app/routers/ocr.py` — upload + job status endpoints
- `backend/app/schemas/ocr.py` — request/response schemas

**Modified files:**
- `docker-compose.yml` — add `redis` and `worker` services
- `docker-compose.override.yml` — expose Redis port 6379, mount volumes for worker
- `docker-compose.prod.yml` — add `redis` and `worker` services (no exposed ports)
- `backend/requirements.txt` — add `redis[hiredis]`, `arq`, `google-genai`, `Pillow`
- `backend/app/config.py` — add `REDIS_URL`, `GEMINI_API_KEY`, and `OCR_MODEL`
- `backend/app/main.py` — include OCR router and initialize/close arq Redis pool on startup/shutdown if the API process enqueues jobs directly

**Docker services to add:**

```yaml
# docker-compose.yml (base)
redis:
  image: redis:7-alpine
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 3s
    retries: 3

worker:
  build: ./backend
  entrypoint: []
  command: arq app.worker.WorkerSettings
  depends_on:
    redis:
      condition: service_healthy
    mysql:
      condition: service_healthy
  environment:
    - REDIS_URL=${REDIS_URL:-redis://redis:6379}
    - GEMINI_API_KEY=${GEMINI_API_KEY}
    - OCR_MODEL=${OCR_MODEL:-gemini-3.1-flash-lite-preview}
    - DATABASE_URL=${DATABASE_URL:-mysql+aiomysql://...}
```

The worker should override the backend image `entrypoint.sh` or make migrations opt-in. Otherwise the API and worker can both run Alembic on startup.

**arq Worker (`backend/app/worker.py`):**

```python
from arq.connections import RedisSettings
from app.config import settings
from app.services.ocr_service import process_image_ocr

class WorkerSettings:
    functions = [process_image_ocr]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 5
    job_timeout = 60
    max_tries = 3
    keep_result = 3600
```

### Phase 2: Backend — OCR Service + Endpoints

**`backend/app/services/ocr_service.py`:**

```python
from google import genai
from google.genai import types, errors
from arq import Retry
from pydantic import BaseModel
from app.config import settings

class ExtractedOperation(BaseModel):
    ticker: str
    date: str  # YYYY-MM-DD
    quantity: float
    total_value: float
    operation_type: str  # "compra" | "venda"
    currency: str | None = None  # BRL | USD | EUR | GBP; asset quote_currency wins

class OcrResult(BaseModel):
    operations: list[ExtractedOperation]
    confidence: str  # "high" | "medium" | "low"
    notes: str | None = None

async def process_image_ocr(ctx, image_b64: str, mime_type: str) -> dict:
    client = ctx.get('genai_client') or genai.Client()
    image_bytes = base64.b64decode(image_b64)

    response = await client.aio.models.generate_content(
        model=settings.OCR_MODEL,
        contents=[
            EXTRACTION_PROMPT,
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
        config=types.GenerateContentConfig(
            response_mime_type='application/json',
            response_schema=OcrResult,
        ),
    )
    return OcrResult.model_validate_json(response.text).model_dump()
```

**`backend/app/routers/ocr.py`:**

```python
# POST /api/ocr/upload
# - Accepts multipart/form-data with 1-5 images
# - Validates MIME type and size
# - Converts each to base64
# - Enqueues one arq job per image
# - Stores { batch_id, user_id, job_ids, image metadata } in Redis
# - Returns { batch_id, job_ids: [...] }

# GET /api/ocr/batch/{batch_id}
# - Verifies batch user_id matches current user
# - Reads status of all jobs in the batch from Redis
# - Returns per-job status + results when completed

# POST /api/ocr/resolve-tickers
# - Accepts { tickers: string[] }
# - Returns linked/global/unknown state plus asset metadata needed by review
```

**`backend/app/routers/purchases.py` — new bulk endpoint:**

```python
# POST /api/purchases/bulk
# - Accepts { items: list[PurchaseCreate] }
# - Validates each item (asset exists, user owns it, position check for sales)
# - Evaluates sale quantities in request order against database position + earlier batch rows
# - Runs _normalize_purchase_values per item
# - Creates all in single transaction
# - Returns list of created purchases or error with failing row index
```

### Phase 3: Frontend — Upload Modal + Review Screen

**New files:**
- `frontend/src/components/ocr-import-modal.tsx` — multi-step modal (upload → processing → review → result)

**Modified files:**
- `frontend/src/app/carteira/aportes/page.tsx` — add "Importar via Imagem" button
- `frontend/src/types/index.ts` — add OCR-related types
- `frontend/src/lib/api.ts` — add `apiUpload`/multipart helper that preserves browser-generated multipart boundaries instead of forcing `Content-Type: application/json`

**Modal steps (following CSV import modal pattern from `csv-import-modal.tsx`):**

1. **Upload** — Dropzone accepting multiple images with previews
2. **Processing** — Progress indicators per image, polling `/api/ocr/batch/{batch_id}` every 2s
3. **Review** — Editable table with columns: Ticker (with status badge), Date, Qty, Total Value, Type, Currency, FX Rate (for non-BRL). Actions: edit row, delete row, add/link asset for unrecognized tickers
4. **Result** — Summary: X purchases created, Y skipped/failed

**New types (`frontend/src/types/index.ts`):**

```typescript
interface OcrUploadResponse {
  batch_id: string;
  job_ids: string[];
}

interface OcrBatchStatus {
  batch_id: string;
  status: 'processing' | 'completed' | 'failed';
  jobs: OcrJobStatus[];
}

interface OcrJobStatus {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: OcrResult;
  error?: string;
}

interface OcrResult {
  operations: ExtractedOperation[];
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

interface ExtractedOperation {
  ticker: string;
  date: string;
  quantity: number;
  total_value: number;
  operation_type: 'compra' | 'venda';
  currency?: CurrencyCode;
}

interface OcrTickerResolution {
  ticker: string;
  state: 'linked' | 'global_unlinked' | 'unknown';
  asset_id?: number;
  quote_currency?: CurrencyCode;
  fx_rate_to_brl?: number | null;
  message?: string;
}
```

### Phase 4: Polish & Edge Cases

- [ ] Duplicate detection warning in review screen
- [ ] Confidence indicator per operation (from Gemini response)
- [ ] Show original image thumbnail alongside extracted data in review
- [ ] Handle Gemini rate limiting (429) with arq retry + user-facing message
- [ ] Loading skeleton during polling
- [ ] Error recovery: retry failed jobs from review screen

### Testing Notes

- Backend tests for `POST /api/purchases/bulk`: atomic rollback, row-indexed error, sale sign conversion, sale exceeding position, and sale after earlier same-batch purchase
- Backend tests for OCR endpoints: invalid MIME, oversized image, too many images, malformed Gemini response, and cross-user batch polling denial
- Frontend tests/manual checks for multipart upload helper, polling timeout, review edits, asset link/add flow, and non-BRL FX calculation
- Docker smoke test: `docker compose up --build` starts `backend`, `redis`, `worker`, and `frontend` without the worker re-running Alembic unexpectedly

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gemini extraction accuracy varies by brokerage app | High | Medium | Review screen lets user correct; generic prompt handles most layouts |
| Redis adds infrastructure complexity | Low | Medium | Alpine image is lightweight; no persistence needed |
| API key costs for Gemini | Low | Low | Flash Lite is very cheap (~$0.01 per image) |
| Base64 images in Redis memory | Medium | Medium | MVP limit reduced to 5 images x 5MB; TTL ensures cleanup |
| arq worker reliability | Low | Medium | Built-in retry; healthcheck in docker-compose |
| Incorrect sale sign conversion | Medium | High | Convert `operation_type=venda` to negative quantity in one backend/frontend mapping path and cover with tests |
| Cross-user batch polling | Low | High | Store `user_id` in batch metadata and enforce it in `GET /api/ocr/batch/{batch_id}` |
| Worker entrypoint runs migrations twice | Medium | Medium | Override worker entrypoint or make migrations opt-in for API only |

## Success Metrics

- Time to register 5 aportes drops from ~2-3 min (manual) to ~30s (OCR + review)
- OCR accuracy > 80% on common BR brokerage apps (Clear, XP, Inter, Nu Invest)
- Zero data integrity issues (review screen prevents bad data)

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-12-image-ocr-aportes-brainstorm.md](docs/brainstorms/2026-04-12-image-ocr-aportes-brainstorm.md) — Key decisions: Redis+arq for queue, Gemini Flash Lite for extraction, base64 in-memory, multi-image v1, review before save, container separado for worker.

### Internal References

- Purchase model: `backend/app/models/purchase.py:10`
- PurchaseCreate schema: `backend/app/schemas/purchase.py:10`
- Purchase creation + normalization: `backend/app/routers/purchases.py:52-107` (normalize), `214-279` (create)
- Asset model + ticker lookup: `backend/app/models/asset.py:95`
- CSV import modal (UI pattern): `frontend/src/components/csv-import-modal.tsx`
- Purchase form (reference): `frontend/src/components/purchase-form.tsx`
- Aportes page: `frontend/src/app/carteira/aportes/page.tsx`
- Docker base: `docker-compose.yml`
- Scheduler pattern: `backend/app/scheduler.py`

### External References

- [arq documentation](https://arq-docs.helpmanual.io/)
- [google-genai SDK](https://github.com/googleapis/python-genai) (replaces deprecated google-generativeai)
- [Gemini model docs](https://ai.google.dev/gemini-api/docs/models)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
