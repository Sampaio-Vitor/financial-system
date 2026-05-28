---
title: Notification Producers
type: feat
status: planned
date: 2026-05-28
---

# Notification Producers

## Overview

The notification skeleton exists and is wired end to end, but it currently has no domain event producers. This plan adds useful notification producers without changing the current notification UI placement or expanding delivery channels beyond in-app notifications.

Existing foundation:

- `backend/app/models/notification.py` stores user-scoped notifications with `type`, `severity`, `link`, `dedupe_key`, and JSON `metadata`.
- `backend/app/services/notification_service.py` has `create_notification(...)` with dedupe support.
- `backend/app/routers/notifications.py` exposes list, unread count, mark one read, and mark all read.
- `frontend/src/components/notification-bell.tsx` polls unread count every 30s and routes users through `notification.link`.

## Confirmed Scope

Implement notification producers for:

1. Dividend/provento detection.
2. Pluggy bank sync results and connection health.
3. Fixed income maturity reminders.
4. Purchase price anomaly detection, with corrected implementation detail.
5. Price update cycle completion and ticker-specific failures.
6. Retirement progress milestones every 5%.
7. Allocation drift/rebalancing nudges.

Do not implement in this pass:

- Financial reserve notifications. The user will see reserve state when adding/removing money.
- OCR batch completion notifications.
- Moving the notification bell to the sidebar/layout. Keep current UI placement for now.
- Push/email/external channels.

## Guiding Rules

- Prefer low-noise notifications. Notify only when a user action is needed, a background process completes with relevant changes, or a milestone is crossed.
- Every notification must have a meaningful `link`.
- Use stable `dedupe_key` values so scheduled jobs do not create duplicate rows.
- Avoid creating notifications from pure read endpoints. Use write paths, scheduled jobs, or explicitly named scan helpers.
- Do not notify historical backfills unless the backfill is explicitly user-initiated and useful to summarize.
- Keep wording concise and actionable in Portuguese, matching the app.

## Notification Type Registry

Add constants to avoid type string drift.

Recommended new module:

- `backend/app/notification_types.py`

Initial constants:

```python
DIVIDEND_DETECTED = "DIVIDEND_DETECTED"
BANK_SYNC_NEW_TRANSACTIONS = "BANK_SYNC_NEW_TRANSACTIONS"
BANK_CONNECTION_ACTION_REQUIRED = "BANK_CONNECTION_ACTION_REQUIRED"
FIXED_INCOME_MATURITY = "FIXED_INCOME_MATURITY"
PURCHASE_PRICE_ANOMALY = "PURCHASE_PRICE_ANOMALY"
PRICE_UPDATE_COMPLETED = "PRICE_UPDATE_COMPLETED"
PRICE_UPDATE_TICKER_FAILED = "PRICE_UPDATE_TICKER_FAILED"
RETIREMENT_PROGRESS_MILESTONE = "RETIREMENT_PROGRESS_MILESTONE"
ALLOCATION_DRIFT = "ALLOCATION_DRIFT"
```

Severity convention:

- `info`: normal progress/update.
- `success`: completed background update or positive milestone.
- `warning`: user attention needed, drift, maturity soon, ticker price failed.
- `error`: connection expired/error or full cycle failure.

## Shared Service Additions

Create a notification producer service instead of spreading formatting in routers.

Recommended file:

- `backend/app/services/notification_producer_service.py`

Responsibilities:

- Domain-specific helper functions such as `notify_dividend_detected(...)`, `notify_price_update_completed(...)`, etc.
- Message formatting and metadata construction.
- Dedupe key construction.
- Any "crossed threshold" checks that require reading previous notifications or snapshots.

Also add a utility for dedupe behavior:

- Current `create_notification(...)` returns an existing notification unchanged when a dedupe key exists.
- For stateful recurring notifications, add `create_or_update_notification(...)` or optional `refresh_existing: bool = False`.
- Use `create_notification(...)` unchanged for one-time event notifications.
- Use update/refresh behavior for state notifications that should reappear later, such as a connection becoming expired again.

## Producer 1: Dividend / Provento Detection

### Current Entry Points

- `backend/app/services/dividend_service.py`
  - `upsert_dividend_event_for_transaction(...)`
  - `backfill_dividend_events_for_account(...)`
- Called during initial connection import in `backend/app/routers/connections.py`.
- Called during incremental sync in `backend/app/services/connection_sync_service.py`.

### Behavior

Create a notification when a new `DividendEvent` is created from a new bank transaction.

Suggested notification:

- `type`: `DIVIDEND_DETECTED`
- `severity`: `info`
- `title`: `Novo provento detectado`
- `message`: `{TICKER or "Provento"}: {amount} creditado em {date}.`
- `link`: `/carteira/proventos`
- `dedupe_key`: `dividend_event:transaction:{transaction_id}`
- `metadata`: `{"transaction_id": ..., "dividend_event_id": ..., "ticker": ..., "amount": ..., "payment_date": ..., "confidence": ...}`

### Noise Control

Do not notify all events from an old initial import by default. Options:

- In incremental sync, notify immediately.
- In initial connection callback, create one summary notification: `{n} provento(s) encontrados na importação inicial`.
- For backfill helpers, support a `notify: bool = False` parameter.

### Implementation Notes

`upsert_dividend_event_for_transaction(...)` currently returns the event but does not tell callers if it was newly created. Change it to return enough information:

```python
@dataclass
class DividendUpsertResult:
    event: DividendEvent | None
    created: bool
```

Then callers can decide whether to notify.

## Producer 2: Pluggy Sync Results And Connection Health

### Current Entry Points

- `backend/app/services/connection_sync_service.py`
  - `sync_connection(...)`
  - `sync_user_connections(...)`
- `backend/app/routers/connections.py`
  - initial callback
  - manual sync endpoint
- Scheduler calls `sync_user_connections(...)` inside the daily price update cycle.

### New Transactions

Notify after an incremental sync imports new transactions.

- `type`: `BANK_SYNC_NEW_TRANSACTIONS`
- `severity`: `info`
- `title`: `Novas transações importadas`
- `message`: `{count} nova(s) transação(ões) importada(s) de {institution_name}.`
- `link`: `/carteira/conexoes`
- `dedupe_key`: `bank_sync:new_transactions:{connection_id}:{last_sync_date_or_run_id}`
- `metadata`: `{"connection_id": ..., "institution_name": ..., "new_transactions": ...}`

For scheduled sync across multiple connections, prefer one per affected connection if the connection name is available. If not, create one user-level summary.

### Connection Health

Notify when a connection moves into a state requiring action.

Statuses already produced:

- `expired`
- `error`
- user-level `auth_failed`
- user-level `invalid_encryption`

Suggested notification:

- `type`: `BANK_CONNECTION_ACTION_REQUIRED`
- `severity`: `error` for `expired`, `auth_failed`, `invalid_encryption`; `warning` for transient `error`
- `title`: `Conexão bancária precisa de atenção`
- `message`: `{institution_name or "Pluggy"} não sincronizou. Reconecte ou revise as credenciais.`
- `link`: `/carteira/conexoes`
- `dedupe_key`: `bank_connection:{connection_id or user_id}:{reason}`
- `metadata`: `{"connection_id": ..., "reason": ...}`

When a connection recovers to `active`, optionally mark the old notification read or create a success notification only for manual reconnect flows. Keep scheduled recovery silent unless useful.

## Producer 3: Fixed Income Maturity Reminders

### Current Entry Points

- `FixedIncomePosition.maturity_date`
- `backend/app/routers/fixed_income.py` create/update paths.
- Scheduler already runs daily; add a second scheduled job or include a notification scan after the price cycle.

### Behavior

Daily scan active fixed income positions with a maturity date.

Reminder buckets:

- `30d`
- `7d`
- `due_today`
- `overdue`

Suggested notification:

- `type`: `FIXED_INCOME_MATURITY`
- `severity`: `warning`
- `title`: `Renda fixa perto do vencimento`
- `message`: `{ticker/description} vence em {date}.`
- `link`: `/carteira/renda-fixa`
- `dedupe_key`: `fixed_income_maturity:{position_id}:{bucket}`
- `metadata`: `{"fixed_income_id": ..., "ticker": ..., "maturity_date": ..., "bucket": ...}`

### Notes

For overdue, dedupe by month to avoid daily spam:

- `fixed_income_maturity:{position_id}:overdue:{YYYY-MM}`

## Producer 4: Purchase Price Anomaly Notifications

### Current State

Anomaly detection already exists in `backend/app/routers/portfolio.py`, but it is a read-path helper used when positions are requested. That is useful for UI, but notifications should not be produced from a GET route.

Also, the earlier suggestion should be corrected: this should not be attached blindly after purchase import/update if historical OHLC is not available yet. The notification producer must first ensure the needed price history exists or schedule the scan after price history refresh.

### Implementation Plan

Extract anomaly logic from `portfolio.py` into a service:

- `backend/app/services/price_anomaly_service.py`

Functions:

```python
async def get_purchase_price_anomalies(db, user, asset_ids: list[int]) -> dict[int, list[PurchasePriceAnomaly]]:
    ...

async def scan_and_notify_purchase_price_anomalies(db, user, purchase_ids: list[int] | None = None) -> int:
    ...
```

Keep `portfolio.py` using the service for UI response shape.

### Scan Triggers

- After daily price update/history refresh, scan recent unignored purchases for all users.
- After OCR bulk purchase import or manual purchase creation/update, optionally attempt a targeted scan for those purchase IDs, but only notify if OHLC exists.
- If OHLC is missing, do not create a notification. The daily scan should catch it later.

Suggested notification:

- `type`: `PURCHASE_PRICE_ANOMALY`
- `severity`: `warning`
- `title`: `Preço de aporte suspeito`
- `message`: `Aporte em {ticker} em {date} está fora da faixa negociada do dia.`
- `link`: `/carteira/aportes`
- `dedupe_key`: `purchase_price_anomaly:{purchase_id}`
- `metadata`: `{"purchase_id": ..., "asset_id": ..., "ticker": ..., "purchase_date": ..., "unit_price_native": ..., "low_native": ..., "high_native": ..., "tolerance_pct": ...}`

### Existing Ignore Flow

The existing ignore endpoint stores `PurchasePriceAnomalyIgnore`. That should suppress future notifications because scans must filter ignored purchases.

## Producer 5: Price Update Cycle Completion And Ticker Failures

### Current Entry Point

- `backend/app/scheduler.py`
  - `_execute_price_update_cycle(...)`
  - `run_price_update_cycle(...)`
  - scheduled daily at 21:00 UTC

The cycle already returns:

- `results["updated"]`
- `results["failed"]`
- `results["status"]`
- `results["connections"]`
- snapshot counts/failures

### Required Behavior

Notify when there is a new update.

At minimum, after every completed price update cycle:

- create a user-visible summary notification for each user that tracks affected assets, or a single user-level summary if per-user mapping is too heavy in phase 1.
- include the number of prices updated.
- if specific tickers failed, notify specifically about those tickers.

### Success / Partial Summary

Suggested notification:

- `type`: `PRICE_UPDATE_COMPLETED`
- `severity`: `success` for full success, `warning` for partial
- `title`: `Cotações atualizadas`
- `message`: `{updated_count} cotação(ões) atualizada(s).`
- `link`: `/carteira`
- `dedupe_key`: `price_update:completed:{YYYY-MM-DD}`
- `metadata`: `{"updated_count": ..., "failed_count": ..., "status": ...}`

### Ticker Failure Notifications

Suggested notification:

- `type`: `PRICE_UPDATE_TICKER_FAILED`
- `severity`: `warning`
- `title`: `Falha ao atualizar cotação`
- `message`: `Não foi possível atualizar {ticker}.`
- `link`: `/carteira/catalogo`
- `dedupe_key`: `price_update:ticker_failed:{ticker}:{YYYY-MM-DD}`
- `metadata`: `{"ticker": ..., "error": ..., "run_date": ...}`

### User Mapping

Preferred implementation:

- For each failed ticker, find users with that asset in `UserAsset`.
- Notify only those users.
- For FX ticker failures like `USDBRL=X`, notify users with any asset using that quote currency.

Fallback implementation:

- Notify all users for global failures, but only as a phase 1 fallback.

## Producer 6: Retirement Progress Milestones Every 5%

### Current State

Retirement overview computes `progresso` in `backend/app/routers/retirement.py`, but this is a GET endpoint and should not create notifications.

### Behavior

Notify when the user crosses each 5% milestone toward the retirement goal:

- 5%, 10%, 15%, ... 100%.

Suggested notification:

- `type`: `RETIREMENT_PROGRESS_MILESTONE`
- `severity`: `success`
- `title`: `Marco de aposentadoria atingido`
- `message`: `Você atingiu {milestone}% da sua meta de aposentadoria.`
- `link`: `/carteira/aposentadoria`
- `dedupe_key`: `retirement_milestone:{milestone}`
- `metadata`: `{"milestone": ..., "progress": ..., "patrimonio_atual": ..., "patrimonio_meta": ...}`

### Scan Trigger

Run after daily snapshot generation, because that is when portfolio value changes from prices/syncs.

### Calculation

Create a service function rather than importing router logic:

- `backend/app/services/retirement_service.py`

Functions:

```python
async def compute_retirement_overview(db, user) -> RetirementOverviewData:
    ...

async def scan_and_notify_retirement_milestones(db, user) -> int:
    ...
```

The router should eventually call the shared compute function too, so the milestone math and UI math do not drift.

### Milestone Selection

If progress jumps from 12% to 27%, create notifications for 15%, 20%, and 25% unless that feels too noisy in testing. If noisy, create only the highest newly crossed milestone and store lower ones as implicitly reached. Initial recommendation: create all crossed 5% milestones because each is one-time deduped.

## Producer 7: Allocation Drift Notifications

### Current State

`RebalancingService.calculate(...)` already computes bucket gaps and statuses.

### Behavior

Notify when a bucket is meaningfully away from target.

Recommended threshold:

- absolute drift >= 5 percentage points from target.
- only buckets with target > 0.
- no notification if total investable portfolio is zero.

Suggested notification:

- `type`: `ALLOCATION_DRIFT`
- `severity`: `warning`
- `title`: `Alocação fora da meta`
- `message`: `{bucket_label} está {abs(drift)} p.p. fora da meta.`
- `link`: `/desejados`
- `dedupe_key`: `allocation_drift:{bucket}:{YYYY-MM}`
- `metadata`: `{"bucket": ..., "target_pct": ..., "current_pct": ..., "drift_pct_points": ...}`

### Scan Trigger

Run monthly after month-end snapshot generation, or after daily price cycle with month-level dedupe. Recommendation: daily scan with monthly dedupe so the user sees drift soon but only once per month per bucket.

### Implementation Detail

Do not call `RebalancingService.calculate(...)` with an arbitrary contribution just for drift. Extract the current bucket-vs-target calculation into a small service helper:

- `backend/app/services/allocation_drift_service.py`

Use existing:

- `get_bucket_values(...)`
- `AllocationTarget`
- `ALLOCATION_BUCKET_LABELS`

## Scheduler Integration

Add a notification scan stage after the existing daily price update, connection sync, and snapshot work.

Recommended sequence inside `_execute_price_update_cycle(...)`:

1. Update all prices.
2. Recompute Tesouro positions.
3. Sync user connections.
4. Generate daily snapshots.
5. Generate monthly snapshots when applicable.
6. Produce price update summary and ticker failure notifications.
7. Produce fixed income maturity notifications.
8. Produce purchase anomaly notifications.
9. Produce retirement milestone notifications.
10. Produce allocation drift notifications.

Be careful with commits:

- Each user notification scan should isolate failure with `try/except` and `rollback`.
- A notification scan failure should not make price update fail if prices/snapshots succeeded.
- Include notification scan failures in logs, not necessarily in user notifications.

## Data / Dedupe Strategy

Use existing `Notification.dedupe_key` where possible.

Suggested keys:

| Event | Dedupe key |
|---|---|
| Dividend transaction | `dividend_event:transaction:{transaction_id}` |
| Initial dividend import summary | `dividend_event:initial_import:{connection_id}` |
| Bank sync new txns | `bank_sync:new_transactions:{connection_id}:{YYYY-MM-DD}` |
| Bank connection action | `bank_connection:{connection_id}:{reason}` |
| Fixed income 30d/7d/today | `fixed_income_maturity:{position_id}:{bucket}` |
| Fixed income overdue | `fixed_income_maturity:{position_id}:overdue:{YYYY-MM}` |
| Purchase anomaly | `purchase_price_anomaly:{purchase_id}` |
| Price update summary | `price_update:completed:{YYYY-MM-DD}` |
| Ticker price failure | `price_update:ticker_failed:{ticker}:{YYYY-MM-DD}` |
| Retirement milestone | `retirement_milestone:{milestone}` |
| Allocation drift | `allocation_drift:{bucket}:{YYYY-MM}` |

## Frontend Work

Keep current bell placement.

Small frontend improvements that fit this pass:

- Render severity affordances in `NotificationBell` rows, using existing `notification.severity`.
- Keep navigation through `notification.link`.
- No new notification center page yet.
- No push notification permission flow.

Optional but useful:

- Add a small `aria-live` update or visual refresh when unread count changes.
- Ensure the bell gracefully handles notification API errors so one failed poll does not spam console/errors.

## Tests

### Backend Integration Tests

Add tests for notification creation and dedupe:

- Dividend detection creates a notification for a newly detected provento.
- Incremental Pluggy sync with new transactions creates a summary notification.
- Expired Pluggy connection creates an action-required notification.
- Fixed income maturity scan creates 30d/7d/today reminders and dedupes repeats.
- Price update completed creates a summary notification.
- Price update failed ticker notifies only users tracking that ticker.
- Price anomaly scan creates notification and respects `PurchasePriceAnomalyIgnore`.
- Retirement milestone scan creates 5% milestones and does not duplicate already-created milestones.
- Allocation drift scan creates monthly-deduped notifications over threshold.

### Unit Tests

- Dedupe key helpers.
- Milestone crossing calculation.
- Allocation drift threshold calculation.
- Fixed income maturity bucket selection.
- Price failure user mapping, including FX ticker mapping.

### Frontend Tests

Extend `frontend/tests/components/notification-bell.test.tsx`:

- Shows severity styling or icon if added.
- Continues to navigate to link on click.
- Handles failed unread count polling without crashing.

## Implementation Phases

### Phase 1: Shared Notification Producer Layer

- Add notification type constants.
- Add `notification_producer_service.py`.
- Add helper for create-or-refresh notification if needed.
- Add test factories/helpers for creating and asserting notifications.

### Phase 2: High-Value Existing Event Producers

- Dividend/provento notifications.
- Pluggy sync new transactions and connection health notifications.
- Fixed income maturity scheduled scan.

### Phase 3: Price And Data Quality Producers

- Extract price anomaly logic out of `portfolio.py`.
- Add anomaly notification scan.
- Add price update summary notifications.
- Add per-ticker failure notifications with user mapping.

### Phase 4: Milestones And Portfolio Guidance

- Extract retirement overview calculation into a reusable service.
- Add 5% retirement milestone scan.
- Add allocation drift scan.

### Phase 5: Frontend Polish And Validation

- Severity display in notification dropdown.
- Additional tests.
- Run backend and frontend tests.
- Run prod-like build before pushing:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

## Acceptance Criteria

- [ ] Notifications are created for newly detected dividends/proventos.
- [ ] Pluggy sync notifies on new transactions and action-required connection states.
- [ ] Fixed income maturity reminders fire at 30d, 7d, due today, and overdue monthly.
- [ ] Purchase price anomaly notifications are generated from a service scan, not from portfolio GET routes.
- [ ] Daily price update creates a new update notification.
- [ ] Failed tickers create ticker-specific notifications for affected users.
- [ ] Retirement milestones notify every 5% from 5% through 100%.
- [ ] Allocation drift notifications fire when a target bucket is at least 5 p.p. away from target.
- [ ] Reserve and OCR notifications are not implemented in this pass.
- [ ] Notification bell placement remains unchanged.
- [ ] Backend tests cover producer creation and dedupe behavior.
- [ ] Frontend notification bell tests still pass.
- [ ] Prod-like Docker build passes before push.

## Risks And Mitigations

- **Noise risk:** scheduled jobs can spam notifications. Mitigate with explicit dedupe keys and monthly/daily buckets.
- **Historical import spam:** initial Pluggy imports and dividend backfills can create many events. Mitigate with summary notifications or `notify=False` during backfill.
- **GET route side effects:** anomaly and retirement logic currently lives close to read routes. Mitigate by extracting services and only producing notifications in scans/write flows.
- **Transaction boundaries:** notification creation inside sync jobs could be committed with domain changes. Keep this acceptable for one-time events, but isolate scheduled scans so notification failures do not roll back price/snapshot work.
- **Per-user price failure mapping:** failed ticker results are global, but notifications should be user-specific. Implement `UserAsset` mapping before enabling ticker failure notifications broadly.

## Follow-Ups Not In This Plan

- Notification preferences per user.
- Notification retention/cleanup job.
- Full notification center page with filters.
- Push/email notifications.
- Mark related stale notifications read when the underlying issue is resolved.
