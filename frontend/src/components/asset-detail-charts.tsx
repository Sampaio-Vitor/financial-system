"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart,
  AreaChart,
  Area,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { formatBRL, formatCurrency, formatQuantity } from "@/lib/format";
import { DividendEventListResponse, Purchase, CurrencyCode } from "@/types";

interface AssetDetailChartsProps {
  ticker: string;
  assetId: number;
  currentPrice: number | null;
  currentPriceNative?: number | null;
  displayCurrency?: CurrencyCode;
  onPriceHistoryLoaded?: () => void;
}

interface DividendPoint {
  date: string;
  label: string;
  acumulado: number;
}

interface HistoricalPricePoint {
  date: string;
  price: number;
  price_native?: number | null;
}

interface ChartDataPoint {
  date: string;
  label: string;
  timestamp: number;
  price: number | null;
  // Forward-filled last known close so the tooltip can show a price on days
  // that have no quote (weekends/gaps), where `price` is null.
  displayPrice: number | null;
  // Y-position for the purchase/sell dot on days that have a trade; null
  // otherwise. Lives on the shared dataset so the Scatter doesn't need its own
  // `data` prop (which would hijack the tooltip's active point).
  markerPrice?: number | null;
  purchases?: PurchaseMarker[];
}

interface PurchaseMarker {
  date: string;
  price: number;
  quantity: number;
  unitPriceNative: number;
  totalValueNative: number;
  tradeCurrency: CurrencyCode;
  fxRate: number;
  ticker: string;
  kind: "buy" | "sell";
}

function calculateAveragePrice(purchases: Purchase[], native = false): number | null {
  if (purchases.length === 0) return null;

  let totalCost = 0;
  let totalQty = 0;

  const sorted = [...purchases].sort((a, b) =>
    a.purchase_date.localeCompare(b.purchase_date)
  );

  for (const p of sorted) {
    const qty = Number(p.quantity);
    const cost = Number(native ? p.total_value_native : p.total_value);

    if (qty > 0) {
      totalCost += cost;
      totalQty += qty;
    } else {
      if (totalQty > 0) {
        const avgBefore = totalCost / totalQty;
        totalQty += qty;
        totalCost = totalQty > 0 ? avgBefore * totalQty : 0;
      }
    }
  }

  return totalQty > 0 ? totalCost / totalQty : null;
}

function buildDividendData(events: DividendEventListResponse["events"]): DividendPoint[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) =>
    a.payment_date.localeCompare(b.payment_date)
  );

  let acumulado = 0;
  const points: DividendPoint[] = [];

  for (const ev of sorted) {
    acumulado += Number(ev.credited_amount);
    const d = new Date(ev.payment_date + "T00:00:00");
    points.push({
      date: ev.payment_date,
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      acumulado,
    });
  }

  return points;
}

function buildPurchaseMarkers(purchases: Purchase[], ticker: string): PurchaseMarker[] {
  return purchases.map((p) => ({
    date: p.purchase_date,
    price: Number(p.unit_price),
    quantity: Number(p.quantity),
    unitPriceNative: Number(p.unit_price_native),
    totalValueNative: Number(p.total_value_native),
    tradeCurrency: p.trade_currency,
    fxRate: Number(p.fx_rate),
    ticker: p.ticker ?? ticker,
    kind: Number(p.quantity) >= 0 ? "buy" : "sell",
  }));
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--color-bg-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "12px",
  },
  labelStyle: { color: "var(--color-text-muted)" },
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number;
    payload: ChartDataPoint;
  }>;
  displayCurrency?: CurrencyCode;
}

function CustomCotacaoTooltip({ active, payload, displayCurrency = "BRL" }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  const priceValue = data.displayPrice;
  if (priceValue == null) return null;

  const d = new Date(data.date + "T00:00:00");
  const dateStr = d.toLocaleDateString("pt-BR");
  const hasPurchases = data.purchases != null && data.purchases.length > 0;

  // A single box: always shows the day's price, and expands with the
  // operation details when there was a buy/sell on that day.
  return (
    <div
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "12px",
        maxWidth: "280px",
      }}
    >
      <p style={{ color: "var(--color-text-muted)", marginBottom: "4px" }}>
        {dateStr}
      </p>
      <p style={{ color: "var(--color-text-primary)" }}>
        Cotação: {formatCurrency(priceValue, displayCurrency)}
      </p>
      {hasPurchases && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            marginTop: "8px",
            paddingTop: "8px",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          {data.purchases!.map((p, index) => {
            const isBuy = p.kind === "buy";
            const absQty = Math.abs(p.quantity);
            return (
              <div key={`${p.date}-${index}`}>
                <p style={{ color: isBuy ? "var(--color-positive)" : "var(--color-negative)", fontWeight: 600 }}>
                  {isBuy ? "Comprou" : "Vendeu"} {formatQuantity(absQty)} {p.ticker} @ {formatCurrency(p.unitPriceNative, p.tradeCurrency)}
                </p>
                <p style={{ color: "var(--color-text-secondary)" }}>
                  Total: {formatCurrency(Math.abs(p.totalValueNative), p.tradeCurrency)}
                </p>
                {p.tradeCurrency !== "BRL" && (
                  <p style={{ color: "var(--color-text-muted)" }}>
                    FX: R$ {p.fxRate.toFixed(2)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type ChartView = "cotacao" | "dividendos";
type RangeKey = "YTD" | "1Y" | "5Y" | "ALL";

const PRICE_RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "YTD", label: "YTD", days: 0 },
  { key: "1Y", label: "1A", days: 365 },
  { key: "5Y", label: "5A", days: 365 * 5 },
  { key: "ALL", label: "Tudo", days: 3650 },
];

function getRangeDays(range: RangeKey): number {
  if (range !== "YTD") {
    return PRICE_RANGES.find((item) => item.key === range)?.days ?? 365;
  }

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const diffMs = now.getTime() - startOfYear.getTime();
  return Math.max(1, Math.ceil(diffMs / 86_400_000));
}

export default function AssetDetailCharts({
  ticker,
  assetId,
  currentPrice,
  currentPriceNative,
  displayCurrency = "BRL",
  onPriceHistoryLoaded,
}: AssetDetailChartsProps) {
  const isNativeView = displayCurrency !== "BRL";
  const fmt = (v: number | null | undefined) => formatCurrency(v, displayCurrency);
  const yTickFormatter = (v: number) => {
    const s = fmt(v);
    return isNativeView ? s : s.replace("R$ ", "R$");
  };
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [dividends, setDividends] = useState<DividendEventListResponse["events"]>([]);
  const [priceHistory, setPriceHistory] = useState<HistoricalPricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ChartView>("cotacao");
  const [range, setRange] = useState<RangeKey>("YTD");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function fetchData() {
      try {
        const [purchasesData, dividendsData, priceHistoryData] = await Promise.all([
          apiFetch<Purchase[]>(`/purchases?asset_id=${assetId}`),
          apiFetch<DividendEventListResponse>(`/dividends?ticker=${ticker}`),
          apiFetch<HistoricalPricePoint[]>(
            `/assets/${assetId}/price-history?days=${getRangeDays(range)}`
          ),
        ]);

        if (cancelled) return;
        setPurchases(purchasesData);
        setDividends(dividendsData.events);
        setPriceHistory(priceHistoryData);
        onPriceHistoryLoaded?.();
      } catch {
        if (cancelled) return;
        setPurchases([]);
        setDividends([]);
        setPriceHistory([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [assetId, ticker, range, onPriceHistoryLoaded]);

  // Build one row per calendar day in the selected range. Missing quotes render
  // as gaps and the invisible displayPrice series keeps tooltips usable.
  const { chartData, windowStart, windowEnd, yDomain } = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - getRangeDays(range));

    const firstPriceDate = priceHistory[0]?.date;
    if (range === "ALL" && firstPriceDate) {
      const first = new Date(firstPriceDate + "T00:00:00");
      if (first > start) start.setTime(first.getTime());
    }

    const purchaseMarkers = buildPurchaseMarkers(purchases, ticker);
    const purchasesByDate = new Map<string, PurchaseMarker[]>();
    for (const pm of purchaseMarkers) {
      const sameDatePurchases = purchasesByDate.get(pm.date) ?? [];
      sameDatePurchases.push(pm);
      purchasesByDate.set(pm.date, sameDatePurchases);
    }

    const toLabel = (d: Date) =>
      d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

    // Index price history by date string for O(1) lookup.
    const priceByDate = new Map<string, number>();
    for (const p of priceHistory) {
      const value = isNativeView ? p.price_native : p.price;
      if (value != null) priceByDate.set(p.date, Number(value));
    }

    // Marker Y position: native trade price when in native view, otherwise BRL unit_price.
    const markerYForPurchase = (m: PurchaseMarker) =>
      isNativeView ? m.unitPriceNative : m.price;

    // One row per calendar day in the window. Days without a quote get price=null
    // and the Line connects across them.
    const data: ChartDataPoint[] = [];
    const cursor = new Date(start);
    let lastKnownPrice: number | null = null;
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10);
      const price = priceByDate.get(iso) ?? null;
      if (price != null) lastKnownPrice = price;
      const dayPurchases = purchasesByDate.get(iso);
      const markerPrice =
        dayPurchases && dayPurchases.length > 0
          ? dayPurchases.reduce((sum, m) => sum + markerYForPurchase(m), 0) /
            dayPurchases.length
          : null;
      data.push({
        date: iso,
        label: toLabel(cursor),
        timestamp: cursor.getTime(),
        price,
        displayPrice: price ?? lastKnownPrice,
        markerPrice,
        purchases: dayPurchases,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    // Compute Y domain from line prices, marker prices and current price so the
    // axis always shows everything visible with a small padding.
    const values: number[] = [];
    for (const d of data) if (d.price != null) values.push(d.price);
    for (const d of data) {
      if (d.markerPrice != null) values.push(d.markerPrice);
    }
    const currentForView = isNativeView ? currentPriceNative : currentPrice;
    if (currentForView != null) values.push(Number(currentForView));

    let domain: [number | string, number | string] = ["auto", "auto"];
    if (values.length > 0) {
      const minV = Math.min(...values);
      const maxV = Math.max(...values);
      const range = maxV - minV;
      const pad = range > 0 ? range * 0.1 : Math.max(1, maxV * 0.02);
      domain = [Math.max(0, minV - pad), maxV + pad];
    }

    return {
      chartData: data,
      windowStart: start.getTime(),
      windowEnd: end.getTime(),
      yDomain: domain,
    };
  }, [priceHistory, purchases, ticker, range, isNativeView, currentPrice, currentPriceNative]);

  // Average price calculation — in display currency.
  const averagePrice = useMemo(
    () => calculateAveragePrice(purchases, isNativeView),
    [purchases, isNativeView],
  );
  const currentPriceForView = isNativeView ? currentPriceNative ?? null : currentPrice;

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse h-52 rounded-xl bg-[var(--color-bg-main)]" />
      </div>
    );
  }

  const dividendData = buildDividendData(dividends);
  const hasDividends = dividendData.length > 0;
  const hasPriceHistory = priceHistory.length > 0;

  if (!hasDividends && !hasPriceHistory) {
    return (
      <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">
        Sem dados para este ativo.
      </div>
    );
  }

  // Available views
  const availableViews: ChartView[] = [];
  if (hasPriceHistory) availableViews.push("cotacao");
  if (hasDividends) availableViews.push("dividendos");

  const effectiveView = availableViews.includes(view) ? view : availableViews[0];
  const showToggle = availableViews.length > 1;

  const viewLabels: Record<ChartView, string> = {
    cotacao: "Cotação",
    dividendos: "Dividendos",
  };

  const viewColors: Record<ChartView, string> = {
    cotacao: "bg-[var(--color-accent)]",
    dividendos: "bg-[#10b981]",
  };

  // Scatter data for purchase markers (one marker per transaction date).
  const hasPurchaseMarkers = chartData.some(
    (d) => d.purchases != null && d.purchases.length > 0,
  );

  return (
    <div className="p-4">
      {/* Header with stats and toggle */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {/* Toggle switch */}
        {showToggle && (
          <div className="flex items-center gap-1 bg-[var(--color-bg-main)] rounded-lg p-1">
            {availableViews.map((v) => (
              <button
                key={v}
                onClick={(e) => { e.stopPropagation(); setView(v); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  effectiveView === v
                    ? `${viewColors[v]} text-white`
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {viewLabels[v]}
              </button>
            ))}
          </div>
        )}

        {/* Stats in top-right */}
        {effectiveView === "cotacao" && (
          <div className="flex items-center gap-4 text-xs">
            {averagePrice != null && (
              <div className="text-right">
                <span className="text-[var(--color-text-muted)]">Preço médio: </span>
                <span className="font-semibold text-[var(--color-text-primary)]">{fmt(averagePrice)}</span>
              </div>
            )}
            {currentPriceForView != null && (
              <div className="text-right">
                <span className="text-[var(--color-text-muted)]">Cotação atual: </span>
                <span className="font-semibold text-[var(--color-text-primary)]">{fmt(currentPriceForView)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {effectiveView === "cotacao" && (
        <div className="mb-3 flex w-full gap-1 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-1 md:w-fit">
          {PRICE_RANGES.map((item) => (
            <button
              key={item.key}
              onClick={(e) => {
                e.stopPropagation();
                setRange(item.key);
              }}
              className={`min-h-8 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                range === item.key
                  ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Price history chart with purchase markers */}
      {effectiveView === "cotacao" && hasPriceHistory && (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData}>
            <defs>
              <linearGradient id={`grad-hist-${assetId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={[windowStart, windowEnd]}
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                new Date(v).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })
              }
              allowDuplicatedCategory={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={yTickFormatter}
              width={80}
              domain={yDomain}
            />
            <Tooltip content={<CustomCotacaoTooltip displayCurrency={displayCurrency} />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke="none"
              fill={`url(#grad-hist-${assetId})`}
              fillOpacity={1}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {/* Invisible forward-filled series so the tooltip activates on every
                day in the window, even those without a quote. */}
            <Line
              type="stepAfter"
              dataKey="displayPrice"
              stroke="transparent"
              strokeWidth={0}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
            {averagePrice != null && (
              <ReferenceLine
                y={averagePrice}
                stroke="var(--color-text-muted)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `PM ${fmt(averagePrice)}`,
                  position: "insideTopRight",
                  fill: "var(--color-text-muted)",
                  fontSize: 10,
                }}
              />
            )}
            {hasPurchaseMarkers && (
              <Scatter
                dataKey="markerPrice"
                fill="var(--color-positive)"
                shape={(props: unknown) => {
                  const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: ChartDataPoint };
                  if (cx == null || cy == null) return <circle r={0} />;
                  const markerPurchases = payload?.purchases ?? [];
                  const hasBuy = markerPurchases.some((purchase) => purchase.kind === "buy");
                  const hasSell = markerPurchases.some((purchase) => purchase.kind === "sell");
                  const fill = hasBuy && hasSell
                    ? "#f59e0b"
                    : hasSell
                      ? "var(--color-negative)"
                      : "var(--color-positive)";
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={markerPurchases.length > 1 ? 7 : 6}
                      fill={fill}
                      stroke="white"
                      strokeWidth={2}
                    />
                  );
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Dividends accumulated area chart */}
      {effectiveView === "dividendos" && hasDividends && (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={dividendData}>
            <defs>
              <linearGradient id={`grad-div-${assetId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatBRL(v).replace("R$\u00a0", "R$")}
              width={80}
            />
            <Tooltip
              formatter={(value: number) => [formatBRL(value), "Acumulado"]}
              {...tooltipStyle}
            />
            <Area
              type="monotone"
              dataKey="acumulado"
              stroke="#10b981"
              fill={`url(#grad-div-${assetId})`}
              strokeWidth={2}
              dot={{ r: 3, fill: "#10b981" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
