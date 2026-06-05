---
title: BTC / Crypto Asset Support
type: feat
status: planned
date: 2026-06-05
---

# BTC / Crypto Asset Support

## Goal

Add proper BTC support to the portfolio app as a first-class crypto asset, not as
a fake stock/ETF. The implementation should be done in small reviewable steps so
an implementing agent can finish one step, stop, and wait for review before
continuing.

## Student Operating Rules

For each step:

1. Read the whole step before editing.
2. Change only the files listed in that step unless the code forces a small
   adjacent change.
3. Do not proceed to the next step until the reviewer approves.
4. At the end of the step, report:
   - files changed
   - commands run
   - test/build result
   - any uncertainty or TODO
5. Never commit unless explicitly asked.

The reviewer should reject a step if it silently changes unrelated behavior,
mixes future steps into the current step, or leaves obvious broken references.

## Product Decision

Initial BTC support should use this model:

```text
AssetType.CRYPTO
AssetClass.CRYPTO
Market.CRYPTO
AllocationBucket.CRYPTO
quote_currency = BRL
price_symbol = BTC-BRL or another provider-specific BRL quote symbol
```

Do not add `BTC` as a `CurrencyCode` in the first version. BTC is the asset, not
the accounting currency. Keeping `quote_currency = BRL` lets the existing
purchase flow store "I bought 0.001 BTC for R$ X" without forcing fake USD trades
or new FX logic.

If price provider testing shows that `BTC-BRL` is unreliable, add a dedicated
crypto price provider before shipping. Do not ship a silently unreliable price
source.

## Out Of Scope For First Version

- Multiple crypto coins.
- Crypto wallets/exchanges.
- Staking, yield, airdrops, or crypto income.
- OCR-specific crypto brokerage parsing.
- Adding BTC as a portfolio currency.
- Tax reporting.

## Progress

- [x] Step 1 - Backend Classification Enums And Labels.
  - Review result: approved.
  - Commit: `70ad50a Add BTC support experiment plan`.
  - Verification run: `python -m compileall backend/app`.
  - Verification run: `git diff --check`.
- [x] Step 2 - Alembic Migration For MySQL Enums.
  - Review result: approved.
  - Verification run: `python -m py_compile backend/alembic/versions/030_add_crypto_enums.py`.
  - Verification run: `git diff --check -- backend/alembic/versions/030_add_crypto_enums.py`.
  - Verification run: `PYTHONPATH=. ../venv/bin/alembic upgrade 029_add_investidor10_dividend_fetch_schedule:030_add_crypto_enums --sql`.
  - Local DB observation: `alembic_version = 030_add_crypto_enums`.
- [x] Step 3 - Backend Asset Create/Update Validation.
  - Review result: approved.
  - Verification run: `docker compose run --rm backend python -m compileall app`.
  - Verification run: `git diff --check`.
  - Narrow check: `CRYPTO/CRYPTO/BRL` accepted, invalid crypto shapes rejected.
- [x] Step 4 - Backend Price Service For BTC.
  - Review result: approved after rework.
  - Provider: CoinGecko BRL prices using `asset.price_symbol` as coin ID.
  - Verification run: `docker compose run --rm backend python -m compileall app`.
  - Verification run: `git diff --check`.
  - Verification run: `venv/bin/ruff check backend/app/services/crypto_price_service.py backend/app/services/price_service.py backend/app/routers/assets.py backend/app/services/trading_calendar.py`.
  - Provider check: current and historical `bitcoin` BRL prices returned valid data.

## Step 0 - Baseline Inventory

Purpose: confirm the repo state and avoid building on a dirty surprise.

Do:

- Run `git status --short`.
- Run `rg "AssetClass|AllocationBucket|AssetType|Market|CurrencyCode" backend frontend`.
- Run `rg "STOCK_BR|STOCK_US|ETF_INTL|FII|RF" frontend/src backend/app`.
- Open these files and understand current patterns:
  - `backend/app/models/asset.py`
  - `backend/app/constants.py`
  - `backend/app/services/price_service.py`
  - `backend/app/services/rebalancing_service.py`
  - `frontend/src/types/index.ts`
  - `frontend/src/app/carteira/catalogo/page.tsx`
  - `frontend/src/app/carteira/aportes/page.tsx`
  - `frontend/src/components/asset-form.tsx`
  - `frontend/src/components/purchase-form.tsx`

Do not edit files in this step.

Review gate:

- Student reports repo status and any existing uncommitted changes.
- Student lists the enum/map locations that will need edits.
- Reviewer confirms the plan still matches the current codebase.

## Step 1 - Backend Classification Enums And Labels - Completed

Purpose: add the backend vocabulary for crypto without changing business flows
yet.

Status: completed and reviewed. The implementation added `CRYPTO` to backend
asset vocabulary, labels, legacy metadata, bucket resolution, and legacy type
resolution. It did not add `BTC` as a `CurrencyCode`.

Edit:

- `backend/app/models/asset.py`
- `backend/app/constants.py`
- backend schemas that directly expose enum values, especially:
  - `backend/app/schemas/asset.py`
  - `backend/app/schemas/purchase.py`
  - `backend/app/schemas/portfolio.py`
  - `backend/app/schemas/allocation.py`
  - `backend/app/schemas/rebalancing.py`
  - `backend/app/schemas/snapshot.py`
  - `backend/app/schemas/saved_plan.py`

Required changes:

- Add `CRYPTO` to `AssetType`.
- Add `CRYPTO` to `AssetClass`.
- Add `CRYPTO` to `Market`.
- Add `CRYPTO` to `AllocationBucket`.
- Keep `CurrencyCode` unchanged for now.
- Update labels:
  - `CLASS_LABELS`
  - `ASSET_CLASS_LABELS`
  - `MARKET_LABELS`
  - `ALLOCATION_BUCKET_LABELS`
- Update `asset_bucket_for(...)`:
  - `AssetClass.CRYPTO` must return `AllocationBucket.CRYPTO`.
- Update `legacy_type_for(...)`:
  - `AssetClass.CRYPTO` must return `AssetType.CRYPTO`.
- Update `resolve_asset_metadata(...)`:
  - `AssetType.CRYPTO` should resolve to `AssetClass.CRYPTO`,
    `Market.CRYPTO`, and `CurrencyCode.BRL`.

Rules:

- Use `Optional[T]`, not `T | None`, in SQLAlchemy mapped types.
- Do not modify price fetching in this step.
- Do not modify frontend in this step.

Review gate:

- Student shows the exact enum/helper diffs.
- Reviewer verifies no crypto was mapped to stocks, ETFs, FIIs, or RF.
- Reviewer verifies `CurrencyCode` did not grow a BTC value.

## Step 2 - Alembic Migration For MySQL Enums - Completed

Purpose: make the database accept the new enum values.

Status: completed and reviewed. The migration adds `CRYPTO` to the MySQL enum
columns needed for assets, allocation targets, and asset daily snapshots while
leaving `CurrencyCode` unchanged.

Edit:

- Add a new file in `backend/alembic/versions/`.

Required migration coverage:

- `assets.type` must accept `CRYPTO`.
- `assets.asset_class` must accept `CRYPTO`.
- `assets.market` must accept `CRYPTO`.
- `allocation_targets.allocation_bucket` must accept `CRYPTO`.
- `asset_daily_snapshots.asset_class` must accept `CRYPTO`, if this column is an
  enum in the current schema.
- `asset_daily_snapshots.market` must accept `CRYPTO`, if this column is an enum
  in the current schema.

Do not change:

- `purchases.quantity`: already supports BTC-scale quantities with
  `Numeric(18, 8)`.
- `purchases.unit_price`: BRL price with 4 decimal places is fine.
- `CurrencyCode` enum columns: BRL quote means no BTC currency is needed.

Important MySQL note:

- MySQL enum migrations usually require `ALTER TABLE ... MODIFY COLUMN ...`.
- Preserve existing nullability/defaults.
- Include a downgrade only if the repo's migration style expects one. If
  downgrading would be destructive because rows may contain `CRYPTO`, make that
  explicit in a comment.

Validation command:

```bash
docker compose up -d mysql
docker compose run --rm backend alembic upgrade head
```

Review gate:

- Student shows the migration file.
- Student reports whether migration applied locally.
- Reviewer checks every affected enum column was included.

## Step 3 - Backend Asset Create/Update Validation - Completed

Purpose: allow BTC assets to exist in the catalog and user asset list.

Status: completed and reviewed. The backend now accepts the narrow first-version
crypto shape `AssetClass.CRYPTO / Market.CRYPTO / CurrencyCode.BRL`.

Edit:

- `backend/app/routers/assets.py`
- Any asset schema touched by route validation.

Required changes:

- Update `_validate_asset_shape(...)` to accept:

```text
asset_class = CRYPTO
market = CRYPTO
quote_currency = BRL
allocation_bucket = CRYPTO
```

- Ensure creating a BTC asset through admin/global catalog works.
- Ensure linking an existing BTC asset to a user works.
- Ensure bulk asset create/import accepts the crypto shape.
- Ensure target allocation validation accepts `AllocationBucket.CRYPTO`.

Rules:

- Do not add frontend UI yet.
- Do not add price fetching yet.
- Do not loosen validation so invalid combinations pass.

Validation commands:

```bash
docker compose run --rm backend python -m compileall app
```

Optional manual API checks if the backend is running:

```text
POST /api/assets
GET /api/assets?asset_class=CRYPTO
PATCH /api/assets/{id}
```

Review gate:

- Student shows route/schema diffs.
- Reviewer checks validation is explicit and narrow.
- Reviewer confirms non-crypto asset validation still behaves as before.

## Step 4 - Backend Price Service For BTC - Completed

Purpose: make "Atualizar Cotações" work for BTC without breaking stocks, FIIs,
ETFs, RF, or FX.

Status: completed and reviewed. yfinance does not provide a usable BRL BTC
symbol, so the implementation uses CoinGecko for current and historical BRL
crypto prices while keeping stock/FII/ETF/FX paths on the existing yfinance flow.

Edit:

- `backend/app/services/price_service.py`
- Related price schemas/tests if present.

Required behavior:

- A crypto asset with `price_symbol = BTC-BRL` should fetch a BRL price.
- The service must not try to append `.SA` to BTC.
- The service must not try to fetch USD/EUR/GBP FX for BTC when
  `quote_currency = BRL`.
- Current price refresh must store BTC price in BRL like other assets.
- Historical price logic must handle crypto's every-day trading calendar.

Implementation guidance:

- Prefer using `asset.price_symbol` exactly for crypto.
- If using yfinance, test `BTC-BRL` manually before coding around it.
- If yfinance is unreliable, introduce a small provider-specific function for
  BTC instead of hacking stock logic.
- Treat crypto as trading every calendar day unless the provider lacks data for
  a date.

Validation commands:

```bash
docker compose run --rm backend python -m compileall app
```

Manual validation:

- Create or use a BTC asset with `price_symbol = BTC-BRL`.
- Trigger price refresh.
- Confirm `current_price` is populated in BRL.
- Confirm existing BR stock/FII/US stock refresh still works.

Review gate:

- Student reports actual provider result for BTC.
- Reviewer checks no stock/FII symbol behavior regressed.
- Reviewer checks no new BTC currency/FX path was introduced.

## Step 5 - Backend Portfolio, Purchases, And Sells

Purpose: make BTC positions appear correctly and allow BTC buy/sell records.

Edit:

- `backend/app/routers/purchases.py`
- `backend/app/routers/portfolio.py`
- `backend/app/services/portfolio_service.py`
- Any purchase/portfolio schema that needs crypto enum values.

Required behavior:

- Buying BTC with decimal quantity works.
- Selling BTC appears in the sell flow and validates available quantity.
- `GET /api/portfolio/positions?asset_class=CRYPTO` returns BTC positions.
- Legacy `asset_class`/`asset_type` response fields do not incorrectly label BTC
  as stock.
- Portfolio overview includes BTC market value.
- Allocation breakdown includes `CRYPTO`.

Rules:

- Keep purchases quoted in BRL for the first version.
- Do not create a `Position` table.
- Do not change RF behavior.

Validation commands:

```bash
docker compose run --rm backend python -m compileall app
```

Manual validation:

- Add a BTC purchase like `quantity = 0.001`.
- Confirm current quantity and average price are correct.
- Add a partial sell.
- Confirm realized sell does not make quantity negative.
- Confirm portfolio total includes BTC.

Review gate:

- Student reports sample BTC buy/sell API responses.
- Reviewer checks decimal handling carefully.
- Reviewer checks BTC does not leak into RF-only or dividend-only paths.

## Step 6 - Backend Rebalancing, Snapshots, Movers, And Exclusions

Purpose: make BTC participate where appropriate and stay out where inappropriate.

Edit:

- `backend/app/services/rebalancing_service.py`
- `backend/app/services/snapshot_service.py`
- `backend/app/services/movers_service.py`
- `backend/app/services/dividend_service.py`, only if enum handling requires an
  explicit crypto exclusion.
- `backend/app/services/investidor10_dividend_service.py`, only if enum handling
  requires an explicit crypto exclusion.

Required behavior:

- Rebalancing may suggest BTC purchases if `AllocationBucket.CRYPTO` has a target
  above current value.
- Snapshot totals include BTC in `CRYPTO`.
- Historical evolution includes BTC after BTC has price history.
- Movers can filter crypto if the frontend asks for it.
- Dividend/proventos automation ignores BTC.
- Bastter/Investidor10/B3-specific logic does not try to process BTC.

Validation commands:

```bash
docker compose run --rm backend python -m compileall app
```

Manual validation:

- Set a crypto allocation target.
- Run or call rebalancing.
- Confirm BTC appears as a candidate only when under target.
- Confirm proventos pages/jobs do not produce BTC events.

Review gate:

- Student shows candidate bucket changes.
- Reviewer checks crypto was added to planning intentionally, not accidentally to
  every stock-only path.

## Step 7 - Frontend Shared Types, Labels, And Formatting

Purpose: make TypeScript understand crypto before page-specific UI work.

Edit:

- `frontend/src/types/index.ts`
- `frontend/src/lib/format.ts`, only if needed.
- Shared label/color/icon files or local label maps found by TypeScript errors.

Required changes:

- Add `CRYPTO` to:
  - `AssetType`
  - `AssetClass`
  - `Market`
  - `AllocationBucket`
- Do not add `BTC` to `CurrencyCode`.
- Add crypto labels/colors wherever there is an exhaustive `Record`.

Commands:

```bash
cd frontend
npm run lint
npm run build
```

Expected result:

- The first build may reveal every hard-coded map that needs `CRYPTO`.
- Fix only shared maps in this step.
- Page-specific behavior belongs to later steps.

Review gate:

- Student lists every exhaustive frontend map changed.
- Reviewer checks colors/labels are consistent and not copied from stock/FII.

## Step 8 - Frontend Catalog And Asset Forms

Purpose: allow viewing, creating, linking, and importing BTC assets.

Edit:

- `frontend/src/app/carteira/catalogo/page.tsx`
- `frontend/src/components/asset-form.tsx`
- `frontend/src/components/csv-import-modal.tsx`
- `/public/modelo-importacao.xlsx`, only if the import template exists there and
  is maintained manually.

Required behavior:

- Catalog filter includes `Crypto`.
- Catalog bucket target editor includes `CRYPTO`.
- Bucket totals still validate to 100%.
- Asset form allows:

```text
asset_class = CRYPTO
market = CRYPTO
quote_currency = BRL
allocation_bucket = CRYPTO
price_symbol = BTC-BRL
```

- CSV import validation accepts the crypto shape.
- CSV sample/template includes a BTC example if templates are user-facing.

Rules:

- Do not implement purchase/sell UI in this step.
- Do not add the crypto portfolio page in this step.

Commands:

```bash
cd frontend
npm run lint
npm run build
```

Review gate:

- Student includes screenshots or a concise UI description of catalog/form
  changes.
- Reviewer checks invalid shapes are still rejected.
- Reviewer checks allocation target UI still sums correctly.

## Step 9 - Frontend New Crypto Portfolio Page And Navigation

Purpose: give BTC its own page under Ativos.

Add:

- `frontend/src/app/carteira/cripto/page.tsx`

Edit:

- Sidebar/navigation components.
- Mobile navigation/drawer components.
- `frontend/src/components/positions-table.tsx`, only if labels/icons need
  crypto polish.
- `frontend/src/components/ticker-logo.tsx`, optional fallback improvement for
  BTC.

Required behavior:

- Sidebar includes a Crypto/BTC entry under Ativos.
- Mobile navigation recognizes `/carteira/cripto` as an Ativos route.
- Page reuses `AssetListPage` with `assetClass="CRYPTO"` and `market="CRYPTO"`,
  unless the component API makes a different narrow filter cleaner.
- BTC quantity displays with enough decimals. Four decimals is not enough for
  small BTC positions; use up to 8 where quantity is shown.

Commands:

```bash
cd frontend
npm run lint
npm run build
```

Manual validation:

- Open `/carteira/cripto`.
- Confirm BTC position appears.
- Confirm native/BRL display is coherent.

Review gate:

- Student shows changed route/nav files.
- Reviewer checks no existing Stocks/Acoes/ETFs/FIIs pages changed behavior.

## Step 10 - Frontend Purchases And Sells

Purpose: make BTC usable from `/carteira/aportes`.

Edit:

- `frontend/src/app/carteira/aportes/page.tsx`
- `frontend/src/components/purchase-form.tsx`
- OCR import/link components only if TypeScript errors require enum labels.

Required behavior:

- Purchase filter includes Crypto or filters by modern `asset_class`.
- Buy mode can select BTC.
- Sell mode fetches BTC owned positions.
- Quantity input allows 8 decimal places.
- BRL currency flow remains the default for BTC.
- Existing stock/FII/ETF/RF purchase flows remain unchanged.

Important existing issue:

- Sell mode currently fetches stocks/ETFs/FIIs explicitly. Add crypto there or
  replace this with a generic owned variable-income positions fetch.

Commands:

```bash
cd frontend
npm run lint
npm run build
```

Manual validation:

- Create BTC buy.
- Edit BTC buy if supported.
- Create BTC sell.
- Confirm BTC sell appears in the transaction list.
- Confirm filtering by Crypto works.

Review gate:

- Student reports buy and sell manual results.
- Reviewer checks decimal precision and currency handling.

## Step 11 - Frontend Dashboard, History, Snapshots, And Planner

Purpose: make BTC visible in aggregate views.

Edit dashboard/history:

- `frontend/src/app/carteira/page.tsx`, only if needed.
- `frontend/src/components/allocation-breakdown.tsx`
- `frontend/src/components/allocation-donut-chart.tsx`
- `frontend/src/components/geography-donut-chart.tsx`
- `frontend/src/components/snapshot-assets-table.tsx`
- `frontend/src/app/carteira/historico/page.tsx`
- `frontend/src/app/carteira/historico/MoversTab.tsx`

Edit planner:

- `frontend/src/app/desejados/page.tsx`
- `frontend/src/app/desejados/salvos/page.tsx`, only if needed.
- `frontend/src/app/desejados/salvos/[id]/page.tsx`
- `frontend/src/components/calculation-memory-modal.tsx`

Required behavior:

- Dashboard allocation shows `CRYPTO`.
- Donut/geography charts do not crash on `CRYPTO`.
- Snapshot asset table shows BTC with 8-decimal quantity support.
- History movers has a Crypto segment if crypto movers are supported.
- Desired allocation planner includes crypto target and crypto suggested aportes.
- Saved plans render crypto labels/colors correctly.

Rules:

- Do not make unrelated dashboard redesigns.
- Do not hide crypto from totals to avoid UI work.

Commands:

```bash
cd frontend
npm run lint
npm run build
```

Manual validation:

- Open `/carteira`.
- Open `/carteira/historico`.
- Open `/desejados`.
- Open a saved plan with crypto, if one exists.

Review gate:

- Student lists each aggregate page checked.
- Reviewer checks totals include BTC exactly once.

## Step 12 - Frontend Pages That Should Explicitly Exclude Or Ignore BTC

Purpose: update enum maps and eligibility rules on pages where BTC should not be
treated as supported content.

Review and edit only as needed:

- `frontend/src/app/carteira/proventos/page.tsx`
- `frontend/src/app/carteira/bastter/page.tsx`
- `frontend/src/app/carteira/renda-fixa/page.tsx`
- `frontend/src/app/carteira/reserva/page.tsx`
- `frontend/src/app/carteira/aposentadoria/page.tsx`
- `frontend/src/app/carteira/conexoes/page.tsx`
- `frontend/src/app/carteira/configuracoes/page.tsx`
- `frontend/src/app/admin/page.tsx`
- `frontend/src/app/login/page.tsx`
- root/error/layout/manifest files

Expected behavior:

- Proventos does not show BTC as dividend-producing.
- Bastter sync does not try to sync BTC.
- RF/Reserva pages do not include BTC.
- Retirement overview can include BTC only through total portfolio values, not as
  RF/reserve.
- Admin/login/config/connections pages compile and do not need visible crypto UI
  unless they expose asset enum labels.

Commands:

```bash
cd frontend
npm run lint
npm run build
```

Review gate:

- Student reports which pages required code changes and which did not.
- Reviewer verifies unsupported BTC workflows are excluded deliberately.

## Step 13 - Backend Tests

Purpose: lock down the business behavior before the full Docker build.

Add tests according to the repo's current backend test style. If there is no
test suite yet, add the smallest useful service-level tests rather than creating
a large framework migration.

Required scenarios:

- `asset_bucket_for(CRYPTO, CRYPTO)` returns `CRYPTO`.
- `legacy_type_for(CRYPTO, CRYPTO)` returns `CRYPTO`.
- BTC purchase with `quantity = 0.001` stores and returns correct quantity.
- BTC sell cannot exceed current quantity.
- Portfolio overview includes BTC value in total and `CRYPTO` bucket.
- Rebalancing includes BTC when crypto bucket is under target.
- Dividend/proventos candidate selection excludes BTC.
- Price refresh uses `price_symbol` directly for BTC.

Commands:

```bash
docker compose run --rm backend pytest
```

If pytest is not configured, report that clearly and at least run:

```bash
docker compose run --rm backend python -m compileall app
```

Review gate:

- Student shows test files and command output.
- Reviewer checks tests assert behavior, not implementation trivia.

## Step 14 - End-To-End Manual QA

Purpose: prove the feature works as a user workflow.

Required local flow:

1. Start the app locally.
2. Create or link BTC in the catalog:

```text
ticker = BTC
name = Bitcoin
asset_class = CRYPTO
market = CRYPTO
quote_currency = BRL
allocation_bucket = CRYPTO
price_symbol = BTC-BRL
```

3. Set crypto allocation target.
4. Refresh prices.
5. Buy `0.001` BTC in BRL.
6. Open `/carteira/cripto` and confirm position.
7. Open `/carteira` and confirm total/allocation includes BTC.
8. Open `/desejados` and confirm BTC can appear in the plan.
9. Sell part of BTC and confirm quantity changes.
10. Confirm `/carteira/proventos` does not produce BTC income.

Commands:

```bash
docker compose up --build
```

Review gate:

- Student reports every manual QA item as pass/fail.
- Reviewer decides whether failures block shipping or become follow-up issues.

## Step 15 - Production-Like Build Check

Purpose: catch TypeScript, standalone Next.js, and Docker issues before pushing.

Run from repo root:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

This is required by the repo guide before pushing.

Review gate:

- Student reports final build result.
- Reviewer checks no migrations or generated files are missing.
- Reviewer confirms no unrelated files were changed.

## Page Impact Summary

High impact:

- `/carteira/catalogo`
- `/carteira/aportes`
- new `/carteira/cripto`
- `/carteira`
- `/desejados`

Medium impact:

- `/carteira/historico`
- `/desejados/salvos/[id]`
- `/carteira/bastter`
- snapshot/detail components used by dashboard/history

Low or no direct impact:

- `/`
- `/login`
- `/admin`
- `/carteira/stocks`
- `/carteira/acoes`
- `/carteira/etfs`
- `/carteira/fiis`
- `/carteira/renda-fixa`
- `/carteira/reserva`
- `/carteira/aposentadoria`
- `/carteira/proventos`
- `/carteira/conexoes`
- `/carteira/configuracoes`
- error/layout/manifest files

## Data Model Summary

No new position table is needed. Existing purchases remain the source of truth.

Tables/columns that need enum awareness:

- `assets.type`
- `assets.asset_class`
- `assets.market`
- `allocation_targets.allocation_bucket`
- `asset_price_history`, only if enum values depend on market/class/currency in
  the current schema
- `asset_daily_snapshots.asset_class`
- `asset_daily_snapshots.market`
- saved-plan JSON does not need migration, but UI labels must render `CRYPTO`

Existing purchase precision is acceptable for BTC:

- `quantity Numeric(18, 8)` supports satoshi-level BTC quantities.
- `unit_price Numeric(18, 4)` is acceptable for BRL BTC price.
- `total_amount Numeric(18, 4)` is acceptable for BRL accounting totals.

## Final Acceptance Criteria

- BTC is a first-class crypto asset, not classified as stock, ETF, FII, or RF.
- User can create/link BTC in catalog.
- User can refresh BTC price in BRL.
- User can buy and sell fractional BTC.
- `/carteira/cripto` shows BTC position.
- Main dashboard includes BTC in totals and allocation.
- Allocation targets support `CRYPTO`.
- Rebalancing can suggest BTC when crypto is under target.
- Saved/desired plans render crypto correctly.
- Proventos/Bastter/B3-specific flows do not process BTC.
- Backend compile/tests pass.
- Frontend lint/build passes.
- Production-like Docker build passes.
