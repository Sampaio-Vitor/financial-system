---
title: Bastter Manual Sync Plan
type: feat
status: proposed
date: 2026-04-07
---

# Bastter Manual Sync Plan

## Overview

Add a manual "Sync Bastter" flow to Cofrinho Gordinho so the user can select local purchase movements and send them to Bastter on demand.

This feature is intentionally scoped as a manual one-shot synchronization:
- only `acao`, `fii`, and `stock`
- only purchase movements
- no automatic background sync
- no session persistence
- no credential storage in database
- no support for renda fixa
- no support for sales

The user will paste their current Bastter session cookie into a temporary form field, select which local movements to sync, and trigger the synchronization. The backend will use the cookie only during that request and discard it immediately after execution.

## Product Goal

The user currently tracks their portfolio in both Cofrinho Gordinho and Bastter. Duplicating every purchase manually is tedious. The goal is to reduce operational friction by allowing selected local purchases to be replayed into Bastter from inside this platform.

## Scope Decision

### In scope

- New page for Bastter sync inside the app
- List eligible local purchase movements
- Allow manual selection of which movements to sync
- Temporary session credential input
- Resolve Bastter `AtivoID` from Bastter asset catalog
- Send selected purchases to Bastter
- Return per-item status to the user
- Support:
  - `acao`
  - `fii`
  - `stock`
- Support purchase movements only

### Out of scope

- Automatic synchronization after saving a purchase
- Persistent Bastter credentials
- Refresh tokens or API key flows
- Sales
- Renda fixa
- Dividend, proventos, juros, resgates, subscricoes
- Full two-way reconciliation
- Long-term sync history in database

## What Was Verified

This section consolidates the technical discoveries already proven during investigation.

### 1. Bastter accepts direct server-side POST requests

We successfully reproduced Bastter requests outside the browser using `curl`, with the same cookies and headers captured from DevTools.

That proves:
- the endpoints accept requests outside the browser
- server-to-server style calls are viable
- the main dependency is an authenticated Bastter web session

### 2. Bastter is not exposing a formal public API token in this flow

What worked in practice was not a dedicated API token. The working credential mechanism appears to be a normal authenticated web session carried by cookies such as:
- `SessionV3`
- `ASP.NET_SessionId`
- and other regular browser cookies

Because of that, this feature should not present the credential field as an "API token". It should be described as a Bastter session cookie copied from DevTools.

### 3. Asset resolution was validated

The endpoint below returns Bastter's asset catalog with `AtivoID` values:

- `POST https://bastter.com/mercado/WebServices/WS_Carteira.asmx/BS2ListAtivos`

The response body format is:
- outer JSON object
- field `d`
- `d` contains another JSON serialized as string
- inside that object there is an `Items` array

Each item includes at least:
- `AtivoID`
- `TipoClasse`
- `Descricao` (ticker/code)
- `Nome`

Confirmed examples from a real response:
- `AAPL` -> `AtivoID: 706313`, `TipoClasse: "stock"`
- `ADBE` -> `AtivoID: 706307`, `TipoClasse: "stock"`
- `XPLG11` -> `AtivoID: 691722`, `TipoClasse: "fii"`

This means Bastter asset IDs can be resolved dynamically from the ticker and type, with no manual local mapping table required for the MVP.

### 4. `BS2ListAtivos` request payload was captured

Observed payload:

```json
{
  "classes": null,
  "ordenacao": "1",
  "classificacoes": ["2", "4", "6", "7"],
  "pas": ["1", "2", "3", "4"],
  "somentePosicao": false
}
```

Observed behavior:
- returns a large catalog of assets
- can be filtered locally after response parsing
- sufficient for resolving Bastter `AtivoID`

### 5. `acao` and `fii` purchases use `SalvarMovimentacao`

Observed endpoint:

- `POST https://bastter.com/mercado/WebServices/WS_Carteira.asmx/SalvarMovimentacao`

Observed `acao` purchase payload:

```json
{
  "movimentacaoID": 0,
  "tipo": "acao",
  "tipomov": "compra",
  "ativoID": 1695832,
  "quantidade": 261,
  "data": "04/07/2026",
  "totalOperacaoBruto": 3591.36,
  "totalOperacaoLiq": null,
  "gasto": false,
  "ignorair": false,
  "ignoraIsencao": false,
  "observacao": null,
  "subscricaoID": 0
}
```

Observed response:

```json
{
  "d": "{\"Return\":true,\"AlertaFreio\":false,\"Roubei\":false,\"AlertaDivida\":false,\"AlertaDARF\":false}"
}
```

Observed `fii` purchase payload:

```json
{
  "movimentacaoID": 0,
  "tipo": "fii",
  "tipomov": "compra",
  "ativoID": 691720,
  "quantidade": 255,
  "data": "03/28/2026",
  "totalOperacaoBruto": 2738.7,
  "totalOperacaoLiq": null,
  "gasto": false,
  "ignorair": false,
  "ignoraIsencao": false,
  "observacao": null,
  "subscricaoID": 0
}
```

Observed response:

```json
{
  "d": "{\"Return\":true,\"AlertaFreio\":false,\"Roubei\":false,\"AlertaDivida\":false,\"AlertaDARF\":false}"
}
```

### 6. `stock` purchases use a different endpoint and payload

Observed endpoint:

- `POST https://bastter.com/mercado/WebServices/WS_Carteira.asmx/SaveMovement`

Observed `stock` purchase payload:

```json
{
  "movimentacaoID": 0,
  "tipo": "stock",
  "ativoID": 706320,
  "quantidade": 2.11,
  "data": "04/01/2026",
  "corretagem": 0,
  "totalOperacao": 0,
  "totalOperacaoEstrangeiro": "690.22"
}
```

Observed response:

```json
{
  "d": "{\"Return\":true,\"AlertaFreio\":false,\"Roubei\":false,\"AlertaDivida\":false}"
}
```

Important difference:
- `stock` does not use `SalvarMovimentacao`
- `stock` uses `SaveMovement`
- payload shape is materially different
- `stock` payload has no observed `tipomov`
- `stock` payload uses `totalOperacaoEstrangeiro`

### 7. CORS behavior was observed but is not a blocker for backend sync

Observed preflight response characteristics:
- endpoint accepts `OPTIONS`
- allowed methods include `GET, POST, OPTIONS`
- `access-control-allow-origin` was `https://bastter.com`

Implication:
- calling Bastter directly from the Cofrinho frontend would likely be blocked by browser CORS
- the correct place to execute the sync is the backend

## Final MVP Proposal

### User experience

Create a new page in the app for Bastter sync with:

- a table of eligible local movements
- selection checkboxes
- filters for type and date if useful
- a large temporary text input for Bastter cookie
- a single action button:
  - `Sincronizar com Bastter`

Suggested flow:

1. User opens the Bastter sync page
2. Page loads local purchase movements eligible for sync
3. User selects which ones to send
4. User pastes the Bastter cookie copied from browser DevTools
5. User clicks sync
6. Backend resolves `AtivoID` for each selected movement
7. Backend sends each purchase to Bastter
8. UI shows per-item result
9. Cookie is discarded after request completion

### UX rules

- Page should clearly state that the cookie is temporary and not stored
- Only eligible movement types should appear
- Only purchase movements should appear
- Response area should show per-item success or failure
- Show Bastter asset resolution result before or during submission if helpful
- Show which endpoint was used internally only if useful for debugging

## Functional Rules

### Eligible local movements

A local movement is eligible if:
- it belongs to a supported asset type:
  - `acao`
  - `fii`
  - `stock`
- it represents a purchase
- it has the fields required to build the Bastter payload

### Excluded movements

Do not attempt sync for:
- sales
- renda fixa
- reserve entries
- dividends
- interest
- redemptions
- unsupported asset types
- malformed or incomplete purchase records

## Technical Design

### High-level architecture

```text
Frontend Sync Page
    |
    v
POST /api/bastter/sync
    |
    +--> validate temporary cookie input
    +--> load selected local purchases
    +--> call BS2ListAtivos using provided cookie
    +--> resolve AtivoID for each selected ticker/type
    +--> build Bastter payload for each purchase
    +--> call Bastter endpoint per item
    +--> collect parsed results
    |
    v
Per-item response back to UI
```

### Why backend, not frontend

Backend execution is the right design because:
- Bastter CORS only allows `https://bastter.com`
- frontend requests from this app would likely fail in-browser
- backend can safely fan out multiple requests and aggregate results
- backend can normalize error handling in one place

## Data Mapping

### Local asset type -> Bastter type

Expected mapping:
- local `acao` -> Bastter `acao`
- local `fii` -> Bastter `fii`
- local `stock` -> Bastter `stock`

This mapping should be explicit in code, not inferred ad hoc.

### Local purchase -> Bastter purchase payload

#### For `acao`

```json
{
  "movimentacaoID": 0,
  "tipo": "acao",
  "tipomov": "compra",
  "ativoID": "<resolved AtivoID>",
  "quantidade": "<local quantity>",
  "data": "<MM/DD/YYYY>",
  "totalOperacaoBruto": "<local gross total>",
  "totalOperacaoLiq": null,
  "gasto": false,
  "ignorair": false,
  "ignoraIsencao": false,
  "observacao": null,
  "subscricaoID": 0
}
```

#### For `fii`

```json
{
  "movimentacaoID": 0,
  "tipo": "fii",
  "tipomov": "compra",
  "ativoID": "<resolved AtivoID>",
  "quantidade": "<local quantity>",
  "data": "<MM/DD/YYYY>",
  "totalOperacaoBruto": "<local gross total>",
  "totalOperacaoLiq": null,
  "gasto": false,
  "ignorair": false,
  "ignoraIsencao": false,
  "observacao": null,
  "subscricaoID": 0
}
```

#### For `stock`

```json
{
  "movimentacaoID": 0,
  "tipo": "stock",
  "ativoID": "<resolved AtivoID>",
  "quantidade": "<local quantity>",
  "data": "<MM/DD/YYYY>",
  "corretagem": 0,
  "totalOperacao": 0,
  "totalOperacaoEstrangeiro": "<foreign total>"
}
```

### Date format

Observed Bastter payloads use:
- `MM/DD/YYYY`

Examples:
- `04/07/2026`
- `03/28/2026`
- `04/01/2026`

This means local ISO dates must be converted before submission.

### Numeric formatting

Rules inferred from captured payloads:

- `acao` and `fii`
  - `quantidade` can be numeric
  - `totalOperacaoBruto` is numeric
  - `totalOperacaoLiq` can be `null`

- `stock`
  - `quantidade` can be decimal
  - `corretagem` was observed as numeric
  - `totalOperacao` was observed as numeric `0`
  - `totalOperacaoEstrangeiro` was observed as string `"690.22"`

Because of that, payload builders must preserve the exact field shape expected by Bastter per asset type.

## Backend API Proposal

### New router

Suggested new backend router:

- `backend/app/routers/bastter_sync.py`

Suggested endpoint:

- `POST /api/bastter/sync`

### Request contract

Suggested request body:

```json
{
  "purchase_ids": [123, 456, 789],
  "cookie": "SessionV3=...; ASP.NET_SessionId=...; ..."
}
```

Notes:
- cookie is raw user-provided cookie header value
- cookie should be used only in memory during this request
- cookie must never be persisted

### Response contract

Suggested response body:

```json
{
  "catalog_items_count": 1234,
  "results": [
    {
      "purchase_id": 123,
      "ticker": "XPLG11",
      "local_type": "fii",
      "bastter_tipo": "fii",
      "ativo_id": 691722,
      "endpoint": "SalvarMovimentacao",
      "payload": {
        "movimentacaoID": 0,
        "tipo": "fii",
        "tipomov": "compra",
        "ativoID": 691722,
        "quantidade": 255,
        "data": "03/28/2026",
        "totalOperacaoBruto": 2738.7,
        "totalOperacaoLiq": null,
        "gasto": false,
        "ignorair": false,
        "ignoraIsencao": false,
        "observacao": null,
        "subscricaoID": 0
      },
      "success": true,
      "bastter_response": {
        "Return": true,
        "AlertaFreio": false,
        "Roubei": false,
        "AlertaDivida": false,
        "AlertaDARF": false
      },
      "error": null
    }
  ]
}
```

The response should be rich enough for debugging. Because this is an operational tool, observability is more important than minimal payload size.

## Internal Backend Components

### 1. Bastter HTTP client

Suggested new service:

- `backend/app/services/bastter_sync_service.py`

Responsibilities:
- build headers for Bastter requests
- call `BS2ListAtivos`
- deserialize nested `d` response
- resolve `AtivoID`
- build payloads per asset type
- submit purchase movements
- parse Bastter responses

Suggested methods:
- `fetch_assets_catalog(cookie: str) -> list[dict]`
- `resolve_ativo_id(items: list[dict], ticker: str, tipo: str) -> int | None`
- `build_payload_for_acao(purchase, ativo_id) -> dict`
- `build_payload_for_fii(purchase, ativo_id) -> dict`
- `build_payload_for_stock(purchase, ativo_id) -> dict`
- `submit_purchase(cookie: str, tipo: str, payload: dict) -> dict`
- `sync_purchases(cookie: str, purchases: list[Purchase]) -> list[dict]`

### 2. Input validation

Backend must validate:
- cookie is present and non-empty
- at least one purchase ID was provided
- all selected purchases belong to the authenticated user
- each selected purchase is an eligible purchase
- each selected purchase has a supported asset type

### 3. Asset resolution strategy

The simplest reliable strategy for MVP:

1. call `BS2ListAtivos` once per sync request
2. parse `Items`
3. build in-memory lookup keyed by:
   - `(TipoClasse, Descricao.upper())`
4. resolve each selected movement against that lookup

Example lookup key:
- `("fii", "XPLG11")`
- `("stock", "AAPL")`
- `("acao", "TAEE11")`

This avoids repeated Bastter catalog calls for each item.

### 4. Per-type endpoint routing

Rules:
- `acao` -> `SalvarMovimentacao`
- `fii` -> `SalvarMovimentacao`
- `stock` -> `SaveMovement`

This should be implemented in a centralized router method, not scattered across controllers.

### 5. Nested response parsing

Bastter responses use this pattern:

```json
{
  "d": "{\"Return\":true,...}"
}
```

So each response requires:
1. parse outer JSON
2. read `d`
3. parse `d` again as JSON

This should be wrapped in a utility method and tested.

## Frontend Proposal

### New page

Suggested route:

- `frontend/src/app/carteira/bastter/page.tsx`

Suggested UI sections:

1. Intro card
- explain the purpose
- explain that only compras de `acao`, `fii`, `stock` are supported
- explain that the Bastter session cookie is temporary and not stored

2. Session credential area
- textarea for raw cookie
- short help text describing where to copy it from in DevTools

3. Movements table
- columns:
  - selection checkbox
  - date
  - ticker
  - type
  - quantity
  - total
- optional filters:
  - type
  - date range
  - ticker search

4. Action area
- selected count
- sync button

5. Results area
- per-item outcome
- show `AtivoID`
- show Bastter success flags
- show error details if any

### Frontend request flow

1. fetch eligible purchases from backend
2. user selects purchases
3. user pastes cookie
4. user submits
5. show loading state
6. receive per-item results
7. render result summary

## Error Handling Requirements

Errors should be isolated per purchase whenever possible.

### Possible failure cases

- invalid or expired Bastter session
- Bastter endpoint unavailable
- asset not found in `BS2ListAtivos`
- multiple matching assets for same ticker/type
- unsupported local asset type
- malformed numeric conversion
- malformed date conversion
- Bastter returns `Return: false`
- Bastter returns alerts or warnings

### Error policy

- one failure should not cancel the whole batch unless catalog fetch itself fails
- response should include item-level failures
- backend should capture both raw and parsed error context where possible

### Session validation strategy

The minimum viable validation is implicit:
- if `BS2ListAtivos` returns correctly, session is valid enough for sync

If it fails due to authentication, return a clear top-level error:
- "Sessao Bastter invalida ou expirada"

## Security Decisions

### Hard requirements

- do not store the Bastter cookie in the database
- do not persist the Bastter cookie in local storage
- do not log the Bastter cookie
- do not echo the raw cookie back to the client
- keep the cookie in memory only for the duration of the request

### Important note from this investigation

Real Bastter session cookies were exposed during debugging. Those cookies are sensitive and should be treated as compromised after sharing. Operationally, the correct recommendation is:

- invalidate the current Bastter session
- log in again
- avoid committing or storing captured cookies anywhere in the repository

### UI wording recommendation

Use language like:
- "Cole aqui o header Cookie da sua sessao atual do Bastter"

Avoid language like:
- "API token"

That wording better matches what was actually observed.

## Idempotency and Re-send Behavior

The user explicitly does not want persistence or remembering sync state.

Implication:
- the system will not know if a movement was previously sent
- the user may resend the same purchase again

That is acceptable for this MVP, but the UI should make it clear that:
- selected movements will be sent as new submissions
- duplicate submissions are possible if the same local movement is resent

Optional non-persistent mitigation:
- show a confirmation summary before sending
- include ticker, date, quantity, and total in the confirmation

## Implementation Plan

### Phase 1: Backend contracts and service

Create:
- schemas for sync request and response
- Bastter sync service
- nested JSON parsing helpers
- payload builders for:
  - `acao`
  - `fii`
  - `stock`

### Phase 2: Backend sync endpoint

Create:
- `POST /api/bastter/sync`

Implement:
- auth
- request validation
- purchase lookup
- eligibility checks
- catalog fetch
- `AtivoID` resolution
- per-item submission
- aggregated response

### Phase 3: Frontend page

Create:
- Bastter sync page under carteira

Implement:
- temporary cookie textarea
- purchase selection UI
- submit action
- results rendering

### Phase 4: UX refinement

Add:
- loading states
- disabled states
- clear error messages
- result summary counts:
  - total selected
  - succeeded
  - failed

## Suggested Files

### Backend

- `backend/app/routers/bastter_sync.py`
- `backend/app/services/bastter_sync_service.py`
- `backend/app/schemas/bastter_sync.py`

Potential minor touch points:
- `backend/app/main.py`
- `backend/app/routers/__init__.py`

### Frontend

- `frontend/src/app/carteira/bastter/page.tsx`
- optional supporting component(s) if page becomes large
- sidebar/navigation entry if needed

## Testing Strategy

### Unit-level tests

Test:
- nested Bastter response parsing
- date conversion to `MM/DD/YYYY`
- payload generation for each type
- `AtivoID` resolution by ticker and type
- invalid type rejection

### Integration-level tests

Mock Bastter endpoints and validate:
- `BS2ListAtivos` parsing
- `SalvarMovimentacao` request contract
- `SaveMovement` request contract
- per-item partial success behavior

### Manual validation checklist

1. Paste valid Bastter cookie
2. Select one `acao`
3. Sync and confirm success
4. Select one `fii`
5. Sync and confirm success
6. Select one `stock`
7. Sync and confirm success
8. Test expired cookie
9. Test ticker not found in Bastter catalog
10. Test mixed batch with one success and one failure

## Open Questions

These are not blockers for the MVP, but they should be confirmed during implementation.

1. Which exact local field should drive the "purchase only" filter for each supported asset type?
2. For `stock`, should local brokerage ever be mapped to Bastter `corretagem`, or do we keep `0` in MVP?
3. For `stock`, should `totalOperacao` remain `0` always in MVP, matching the observed request?
4. Are there cases where the same ticker appears more than once for the same `TipoClasse` in `BS2ListAtivos`?
5. Do `acao` and `fii` require any extra handling for fractional quantities in edge cases?

## Final Recommendation

This feature is viable and the technical path is sufficiently clear.

The chosen MVP is good because it:
- solves the real user pain
- keeps the scope narrow
- avoids credential persistence
- avoids background automation complexity
- uses endpoints already validated in practice

The main implementation principle should be:
- manual
- explicit
- observable
- non-persistent

That is the right shape for a first Bastter sync integration in this project.
