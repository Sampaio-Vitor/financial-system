---
date: 2026-05-16T20:53:09-0300
author: Vitor Sampaio
commit: 39172c3
branch: main
repository: financial_system
topic: "Buy-and-hold UI focus changes"
status: ready
confidence: high
complexity: medium
tags: [plan, frontend, buy-and-hold, ui, portfolio]
last_updated: 2026-05-16T20:53:09-0300
last_updated_by: Vitor Sampaio
---

# Implementation Plan: Buy-and-Hold UI Focus Changes

## Goal

Reduce the temptation to check daily asset prices while preserving automatic daily price updates for calculations, especially the Planejador de Aporte.

## Confirmed decisions

1. Remove price update status from `Visão Geral`.
2. Remove `Histórico` from navigation. Do not delete the route/backend data; just hide the entry point.
3. Make asset list pages less price/P&L focused.
4. No separate work needed for `Movers`, because hiding `Histórico` removes it from normal navigation.
5. Keep the expanded asset graph, but replace the separate `Preço Médio` chart tab with purchase markers on the price chart:
   - main chart remains price history;
   - buy points appear as differently colored dots;
   - tooltip shows purchase details, e.g. `Comprou 125 AAPL @ US$ XXX`;
   - average price appears as a compact value in the top-right of the graph, not as its own tab.

## Non-goals

- Do not stop backend price updates.
- Do not remove `/carteira/historico` route implementation yet.
- Do not remove price/P&L data from APIs.
- Do not redesign the aporte planner.
- Do not remove the asset click/expand behavior.

---

## Phase 1 — Remove daily price update cue from Visão Geral

### Files

- `frontend/src/app/carteira/page.tsx`
- Optional cleanup: `frontend/src/components/price-update-status.tsx`

### Changes

1. Remove `PriceUpdateStatus` import from `frontend/src/app/carteira/page.tsx`.
2. Remove `<PriceUpdateStatus />` from the header next to `Visão Geral`.
3. Keep `frontend/src/components/price-update-status.tsx` for now unless no other references exist.

### Success criteria

- `Visão Geral` no longer shows last/next price update.
- Price update backend and `/prices/status` remain untouched.
- Frontend build passes.

---

## Phase 2 — Hide Histórico from normal navigation

### Files

- `frontend/src/components/sidebar.tsx`
- Verify mobile impact through `frontend/src/components/mobile-drawer.tsx`, because it likely consumes the same `navItems` export.

### Changes

1. Remove this nav item from `navItems`:

```ts
{
  label: "Histórico",
  href: "/carteira/historico",
  icon: LineChart,
}
```

2. Remove unused `LineChart` import if nothing else in the file uses it.
3. Keep the actual page files:
   - `frontend/src/app/carteira/historico/page.tsx`
   - `frontend/src/app/carteira/historico/MoversTab.tsx`

### Success criteria

- Sidebar no longer shows `Histórico`.
- Mobile drawer no longer shows `Histórico` if it uses shared `navItems`.
- Direct URL `/carteira/historico` can still work for occasional/manual access.

---

## Phase 3 — Make position tables allocation/holding-oriented instead of quote-board-oriented

### Files

- `frontend/src/components/positions-table.tsx`
- `frontend/src/components/asset-list-page.tsx`

### Current issue

`PositionsTable` currently exposes these as first-class columns/cards:

- `Cotação Atual`
- `P&L (R$)`
- `P&L (%)`
- P&L sorting
- mobile P&L badge

### Proposed default behavior

Keep the table useful for holdings, but remove the immediate price-checking cues.

#### Desktop default columns

Replace current columns with something closer to:

```text
Ativo | Quantidade | Valor na Carteira | Custo Total | Primeira Compra | Detalhes
```

Notes:

- Keep `Valor na Carteira` because allocation/planner logic depends on current value and it is less quote-like than `Cotação Atual`.
- Hide `Cotação Atual` from the main row.
- Hide `P&L (R$)` and `P&L (%)` from the main row and totals header.
- Remove P&L from default sort options.
- Preserve row click to expand chart/details.

#### Mobile default card

Change mobile cards from:

- badge: P&L %
- body: Valor Mercado, Quantidade
- expanded: Preço Médio, Cotação Atual, FX, P&L

To:

- badge: market/currency metadata or asset type, not P&L
- body: Valor na Carteira, Quantidade
- expanded: Custo Total, Primeira Compra, Moeda/FX if relevant
- omit P&L and current quote from the normal card

### Optional fallback

If we want a low-risk first implementation, introduce a prop:

```ts
interface PositionsTableProps {
  // existing props...
  mode?: "focus" | "full";
}
```

Then `AssetListPage` can default to `mode="focus"`. This keeps the old full rendering easier to recover later if needed.

### Success criteria

- Asset pages no longer look like market quote boards.
- User can still inspect an asset by clicking/expanding it.
- No backend/API change required.
- Existing position values still render without TypeScript errors.

---

## Phase 4 — Redesign expanded asset chart: price + purchase markers + average price summary

### File

- `frontend/src/components/asset-detail-charts.tsx`

### Current state

The component currently has three views:

```ts
type ChartView = "preco_medio" | "dividendos" | "cotacao";
```

It renders:

- `Cotação` chart from `/assets/{assetId}/price-history?days=90`
- `Preço Médio` chart as a separate tab
- `Dividendos` chart

### Target state

Use only these chart views:

```ts
type ChartView = "cotacao" | "dividendos";
```

The `Cotação` chart becomes richer:

- price history area/line remains;
- buy transactions are plotted as dots on the chart;
- purchase tooltip shows transaction details;
- average price is shown as a small top-right stat above the graph;
- optional: current price can also appear in the same stat row if desired.

Example chart header:

```text
Cotação                                      Preço médio: R$ 42,10
                                             Cotação atual: R$ 51,30
```

Example purchase tooltip:

```text
15/03/2024
Comprou 125 AAPL @ US$ 182.30
Total: US$ 22,787.50
FX: R$ 4.98
```

For BR assets:

```text
15/03/2024
Comprou 100 ITSA4 @ R$ 9,85
Total: R$ 985,00
```

### Implementation details

1. Keep fetching purchases:

```ts
apiFetch<Purchase[]>(`/purchases?asset_id=${assetId}`)
```

2. Adjust price-history range.

Current code fetches only 90 days:

```ts
apiFetch<HistoricalPricePoint[]>(`/assets/${assetId}/price-history?days=90`)
```

For purchase markers to be useful, use a range covering the oldest purchase. Simplest acceptable implementation:

- fetch purchases first;
- compute days from oldest purchase to today, capped to a reasonable max like 3650;
- fetch `/assets/${assetId}/price-history?days=${days}`.

Alternative simpler first pass:

- fetch `days=3650` only when the user expands an asset.

3. Replace `AreaChart` with `ComposedChart` for the cotação view.

Needed Recharts imports:

```ts
ComposedChart,
Area,
Scatter,
XAxis,
YAxis,
Tooltip,
ResponsiveContainer,
CartesianGrid,
```

4. Build purchase marker data.

Create a helper like:

```ts
interface PurchaseMarker {
  date: string;
  label: string;
  price: number;
  quantity: number;
  unitPriceNative: number;
  totalValueNative: number;
  tradeCurrency: CurrencyCode;
  fxRate: number;
  kind: "buy" | "sell";
}
```

For buys:

```ts
quantity > 0
price = unit_price_native ?? unit_price
```

Optional: if sells exist, show them as red markers later. First pass can only mark buys.

5. Tooltip behavior.

Use a custom tooltip for the cotação chart because the same chart will have normal price points and purchase markers.

The tooltip should distinguish:

- normal price hover: `Cotação: R$ ...`
- purchase marker hover: `Comprou {quantity} {ticker} @ {currency price}`

6. Average price computation.

Reuse the existing weighted-average logic from `buildPriceData`, but stop rendering it as its own chart.

Refactor to something like:

```ts
function calculateAveragePrice(purchases: Purchase[]): number | null
```

Then render it above the cotação chart.

7. Remove `preco_medio` tab UI.

Remove from:

- `ChartView` union
- `availableViews`
- `viewLabels`
- `viewColors`
- JSX block for `effectiveView === "preco_medio"`

### Success criteria

- Clicking an asset still opens a chart.
- The default chart still shows price history.
- Buy transactions appear as colored dots when they fall within the fetched history range.
- Hovering a dot shows purchase details.
- `Preço Médio` appears as a compact stat, not a tab.
- Dividend chart still works when dividend data exists.

---

## Phase 5 — Validation

### Commands

Run at least:

```bash
cd frontend
npm run lint
npm run build
```

Project-level production check, per repo instructions:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

### Manual verification checklist

- [ ] `Visão Geral` loads without price update status.
- [ ] Sidebar and mobile drawer do not show `Histórico`.
- [ ] `/carteira/historico` still works by direct URL.
- [ ] `/carteira/acoes`, `/carteira/stocks`, `/carteira/etfs`, `/carteira/fiis` load.
- [ ] Position tables no longer show `Cotação Atual` / P&L prominently.
- [ ] Clicking a position expands the chart.
- [ ] Cotação chart shows purchase markers for assets with buys inside the history range.
- [ ] Purchase marker tooltip shows quantity, ticker, unit price, total, and currency.
- [ ] Dividend tab still appears for assets with dividends.
- [ ] Planejador de Aporte still calculates normally.

---

## Suggested implementation order

1. Phase 1 and Phase 2 first — tiny, low risk, immediate behavioral improvement.
2. Phase 4 next — satisfies the new graph requirement while preserving click-to-inspect behavior.
3. Phase 3 last — table restructuring is most likely to need visual iteration.

## Risk notes

- Purchase markers may require fetching more than 90 days of price history. If the backend endpoint or provider cache only has recent data, markers for old purchases may not appear until history exists.
- Overlaying purchase markers in Recharts is easier with `ComposedChart` than `AreaChart`.
- Removing P&L from tables is UI-only; the data can stay in `PositionsResponse` for future optional/full views.
