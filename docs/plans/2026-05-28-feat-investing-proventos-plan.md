---
title: Investing Proventos Calendar
type: feat
status: planned
date: 2026-05-28
---

# Investing Proventos Calendar

## Overview

Use Investing.com public endpoints as the announced/future proventos source for
variable-income assets, while preserving Pluggy bank transactions as the trusted
confirmation source for Brazilian paid proventos.

This feature reformulates `Proventos` into a received-vs-expected experience:

- `Recebidos`: confirmed or considered-paid proventos.
- `Previstos`: announced future proventos from Investing.

The first production backfill should be manual, after migrations are deployed,
covering only 2026 onward.

## Source Rules

### Brazilian Assets

Brazilian assets include `ACAO` and `FII`.

- Investing is the future/announced reference.
- Pluggy is the paid/current truth.
- Future Investing events appear in `Previstos`.
- A Brazilian Investing event must not be counted as received only because its
  payment date passed.
- If a Brazilian Investing event has `payment_date < today` and no Pluggy match,
  keep it out of realized totals and mark it as `UNCONFIRMED`.
- If a Pluggy transaction is matched, mark the event as `CONFIRMED` and count it
  in `Recebidos`.

### Foreign Assets

Foreign assets include US stocks and ETFs, and can later include other non-BR
markets if supported by the existing asset metadata.

- Investing is the reference for expected and paid proventos.
- A foreign Investing event with `payment_date > today` is `EXPECTED`.
- A foreign Investing event with `payment_date <= today` is `PAID`.
- Foreign paid events count in the payment month even without a bank transaction.

## Eligibility

Fetch Investing proventos only for variable-income assets with current position.

Eligible:

- `ACAO`
- `FII`
- `STOCK`
- `ETF`

Not eligible:

- `RF`
- assets with current quantity equal to zero
- paused assets, if paused means the app should ignore them for planning

This keeps the feature focused on assets the user actually holds. Adding a new
ticker should not require manual setup: once the user has a current position, the
next daily job resolves the Investing instrument and fetches events.

## Investing Endpoints

Prototype script:

- `/Users/vitorsampaio/personal_projects/test_yfinance/find_investing_instrument.py`

Endpoints used by the prototype:

```text
GET https://api.investing.com/api/search/v2/search?q={ticker}
GET https://endpoints.investing.com/dividends/v1/instruments/{instrument_id}/dividends
```

Headers from the prototype:

```text
domain-id: br
user-agent: Mozilla/5.0
```

Production behavior:

- Trust the first Investing search result for now.
- Cache the selected instrument on the local asset.
- Store raw Investing rows in `raw_data` for future corrections.
- Treat failures as non-fatal to the daily price/snapshot cycle.

## Data Model

Prefer extending `dividend_events` instead of creating a parallel user-facing
table, because the UI should continue to read one proventos feed.

Current blocker:

- `dividend_events.transaction_id` is non-null and unique, which only fits
  Pluggy/bank-origin events.

Migration changes:

- Make `transaction_id` nullable.
- Preserve uniqueness for bank transactions.
- Add a stable unique key for Investing-origin events.

Recommended new or changed fields on `dividend_events`:

```text
source                 BANK_TRANSACTION | INVESTING
status                 EXPECTED | PAID | CONFIRMED | UNCONFIRMED
source_event_key        stable dedupe key for Investing rows
ex_date                 Investing ex-dividend date
payment_date            existing field, still required
declared_currency       BRL | USD | ...
amount_per_unit_native  per-share/per-unit amount in declared currency
quantity_base           existing field, quantity held on ex-date
gross_amount_native
withholding_tax_native
credited_amount_native
fx_rate_to_brl
gross_amount            BRL gross amount
withholding_tax         BRL withholding/tax amount
credited_amount         BRL net amount used for received/expected totals
raw_data                existing field, store provider payload
```

Recommended new fields on `assets`:

```text
investing_instrument_id
investing_instrument_name
investing_exchange
investing_resolved_at
investing_resolution_status
investing_resolution_error
```

Use `Optional[T]` for SQLAlchemy `Mapped` nullable types, matching repo
conventions.

## Tax / Net Amount Rules

Store both pre-tax and post-tax values.

For foreign USD assets:

```text
gross_amount_native = quantity_on_ex_date * amount_per_unit_native
withholding_tax_native = gross_amount_native * 0.30
credited_amount_native = gross_amount_native - withholding_tax_native
```

Then convert gross, tax, and net values to BRL using the available FX rate.

For Brazilian FIIs:

- Default `gross = net`.
- Default withholding tax to zero.

For Brazilian stocks:

- Default dividends to `gross = net`.
- JCP may require withholding tax, but Investing payload must be inspected before
  relying on automatic classification.
- If classification is uncertain, store raw data and let Pluggy confirmation
  provide the paid truth.

## Status Lifecycle

Do not physically move rows between tabs. Keep one row and update or derive
status.

Daily status rules:

- Investing foreign event with `payment_date <= today`: `PAID`.
- Investing foreign event with `payment_date > today`: `EXPECTED`.
- Investing Brazilian event with `payment_date > today`: `EXPECTED`.
- Investing Brazilian event with `payment_date < today` and no Pluggy match:
  `UNCONFIRMED`.
- Brazilian event matched to Pluggy transaction: `CONFIRMED`.
- Existing bank-only event from Pluggy: `CONFIRMED`.

User-facing totals:

- `Recebidos` includes `PAID` foreign Investing events and `CONFIRMED` Pluggy/BR
  events.
- `Previstos` includes `EXPECTED`.
- `UNCONFIRMED` is shown separately or with a warning badge, but does not inflate
  received totals.

## Matching Pluggy and Investing

Pluggy detection currently creates dividend events from bank transactions.

Add matching logic for Brazilian assets:

- Match by user, ticker, payment date proximity, and net amount tolerance.
- If matched, link the bank transaction and Investing event or merge state into
  one canonical event.
- Keep stable dedupe so the same Pluggy transaction does not create duplicates.

Initial implementation can be conservative:

- Continue creating Pluggy `CONFIRMED` events as today.
- Add Investing events for future calendar rows.
- Add matching in a second pass if the first implementation would risk duplicate
  historical rows.

## Backend Services

Add:

- `backend/app/services/investing_dividend_service.py`

Responsibilities:

- Resolve Investing instrument IDs.
- Fetch dividend rows.
- Normalize payload fields.
- Compute quantity held on ex-date.
- Compute gross/tax/net in native currency and BRL.
- Upsert `DividendEvent` rows.
- Return counts for created, updated, skipped, and failed tickers.

Useful service functions:

```python
async def resolve_investing_instrument(db, asset) -> InvestingInstrumentResult: ...

async def fetch_investing_dividends(instrument_id: int) -> list[InvestingDividendRow]: ...

async def scan_investing_dividends_for_current_positions(
    db,
    *,
    start_date: date,
    end_date: date,
    notify: bool = True,
) -> InvestingDividendScanSummary: ...
```

Keep request timeouts, a small concurrency limit, and exception isolation per
asset.

## Scheduler Integration

The existing scheduler runs at 21:00 UTC, which is 18:00 BRT:

- `backend/app/scheduler.py`
- job id: `daily_price_update`

Add an Investing proventos stage inside the existing locked daily cycle.

Recommended daily fetch window:

```text
start_date = today - 30 days
end_date = today + 180 days
```

This makes missed runs and late provider corrections self-healing without
re-fetching unnecessary years.

The Investing stage must not fail the whole price update cycle. If it fails:

- Roll back only the affected stage or asset.
- Log details.
- Continue snapshots and other notification scans when possible.
- Produce failure notifications for affected users when appropriate.

## Notifications

Add notification types:

```python
INVESTING_DIVIDEND_DETECTED = "INVESTING_DIVIDEND_DETECTED"
INVESTING_DIVIDEND_FETCH_FAILED = "INVESTING_DIVIDEND_FETCH_FAILED"
```

Producer helpers should live in:

- `backend/app/services/notification_producer_service.py`

Detection notification:

- `title`: `Novo provento previsto`
- `message`: `{ticker}: {net_amount} líquidos previstos para {payment_date}.`
- `link`: `/carteira/proventos?tab=previstos`
- `severity`: `info`
- `dedupe_key`: `investing_dividend:{user_id}:{asset_id}:{source_event_key}`

Fetch failure notification:

- `title`: `Falha ao buscar proventos`
- `message`: `Não foi possível atualizar proventos de {ticker} hoje.`
- `link`: `/carteira/proventos?tab=previstos`
- `severity`: `warning`
- `dedupe_key`: `investing_dividend_fetch_failed:{asset_id}:{run_date}`

Noise control:

- Do not notify during manual historical backfill.
- Notify only for assets with current position.
- Prefer grouped failure notifications per user if several tickers fail in the
  same run.

## Manual Backfill

Do not run the initial backfill automatically on startup or migration.

After production migrations and code deploy:

1. Verify the app boots.
2. Verify existing proventos still render.
3. Run a dry-run backfill.
4. Inspect counts by user, ticker, status, and source.
5. Run the real backfill with notifications disabled.
6. Spot-check the DB and `/carteira/proventos`.

Backfill scope:

```text
start_date = 2026-01-01
end_date = today + 180 days
notify = false
```

Add a script:

- `backend/app/scripts/backfill_investing_dividends.py`

Example prod commands:

```bash
docker exec -it portfolio_api python -m app.scripts.backfill_investing_dividends \
  --start-date 2026-01-01 \
  --end-date 2026-12-31 \
  --dry-run
```

```bash
docker exec -it portfolio_api python -m app.scripts.backfill_investing_dividends \
  --start-date 2026-01-01 \
  --end-date 2026-12-31
```

The script should default to `notify=False`. Add `--notify` only if a later
workflow explicitly needs it.

## API Changes

Extend:

- `backend/app/schemas/dividend.py`
- `backend/app/routers/dividends.py`

Recommended filters:

```text
year
month
ticker
event_type
source
status
tab = recebidos | previstos | all
include_unconfirmed
asset_class
market
```

Recommended response additions:

```text
source
status
ex_date
declared_currency
amount_per_unit_native
gross_amount_native
withholding_tax_native
credited_amount_native
fx_rate_to_brl
```

Keep existing response fields compatible where possible so the frontend can be
migrated incrementally.

## Frontend Reformulation

Rework:

- `frontend/src/app/carteira/proventos/page.tsx`

Create two primary tabs.

### Recebidos

Purpose: realized income.

Includes:

- Pluggy-confirmed BR proventos.
- Foreign Investing proventos with `payment_date <= today`.

Top cards:

- `Recebido no ano`
- `Imposto retido`
- `Líquido recebido`
- `Maior pagador`

Charts:

- Monthly received bars.
- Gross vs net, where tax data exists.
- Distribution by asset.

Table columns:

- Data pagamento
- Ticker
- Tipo
- Fonte
- Bruto
- Imposto
- Líquido
- Status

### Previstos

Purpose: announced future cash flow.

Includes:

- Investing events with `payment_date > today`.

Top cards:

- `Previsto próximos 30 dias`
- `Previsto no ano`
- `Imposto estimado`
- `Próximo pagamento`

Views:

- Monthly forecast chart.
- Upcoming payment list grouped by month.
- Asset breakdown for expected payments.

Table columns:

- Ex-data
- Pagamento
- Ticker
- Quantidade base
- Valor por cota/ação
- Bruto
- Imposto estimado
- Líquido previsto
- Status

Shared filters:

- Ano
- Mês
- Ticker
- Classe
- Fonte
- Status

Important UI rule:

- Future events must not inflate realized totals.
- `UNCONFIRMED` Brazilian events should be visible but clearly separated from
  received income.

## Testing

Backend tests:

- Investing payload normalization.
- Instrument resolution uses first result and caches it.
- Current-position eligibility excludes zero-position assets.
- Quantity held on ex-date is calculated correctly.
- Foreign payment-date status moves from `EXPECTED` to `PAID`.
- Brazilian payment-date status becomes `UNCONFIRMED` unless Pluggy confirms.
- Backfill uses `notify=False`.
- Daily scan isolates per-asset failures.
- Notification dedupe prevents repeated detected/failure notifications.

Frontend tests:

- `Recebidos` excludes future events.
- `Previstos` excludes paid/confirmed events.
- Gross, tax, and net values render.
- Empty states remain useful for each tab.

Validation before push:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

## Rollout Plan

1. Add migrations for `dividend_events` and `assets`.
2. Add Investing service and tests.
3. Add backend scan/backfill script with dry-run.
4. Integrate daily scheduler stage.
5. Add notification producers.
6. Update `/api/dividends` response and filters.
7. Reformulate frontend `Proventos` page into `Recebidos` and `Previstos`.
8. Deploy to prod.
9. Run dry-run backfill manually.
10. Run real 2026-onward backfill manually with notifications disabled.
11. Spot-check database and UI.

## Open Decisions

- Whether Brazilian JCP tax can be reliably inferred from Investing payload.
- Whether `UNCONFIRMED` Brazilian rows should be shown in a third small section
  or as a warning state inside `Previstos`.
- Whether Pluggy/Investing matching should merge rows immediately or be a second
  implementation pass after the calendar is live.
