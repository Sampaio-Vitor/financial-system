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

  // If this point has purchase/sell markers, show every transaction from the date.
  if (data.purchases && data.purchases.length > 0) {
    const d = new Date(data.date + "T00:00:00");
    const dateStr = d.toLocaleDateString("pt-BR");

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
        <p style={{ color: "var(--color-text-muted)", marginBottom: "6px" }}>
          {dateStr}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {data.purchases.map((p, index) => {
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
      </div>
    );
  }

  // Normal price point
  const priceValue = payload.find((p) => p.dataKey === "price")?.value;
  if (priceValue != null) {
    return (
      <div
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          padding: "8px 12px",
          fontSize: "12px",
        }}
      >
        <p style={{ color: "var(--color-text-muted)", marginBottom: "4px" }}>
          {data.label}
        </p>
        <p style={{ color: "var(--color-text-primary)" }}>
          Cotação: {formatCurrency(priceValue, displayCurrency)}
        </p>
      </div>
    );
  }

  return null;
}

type ChartView = "cotacao" | "dividendos";

export default function AssetDetailCharts({
  ticker,
  assetId,
  currentPrice,
  currentPriceNative,
  displayCurrency = "BRL",
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function fetchData() {
      try {
        // Keep the price chart behavior exactly as before: a 90-day quote history.
        // Purchases are fetched only to overlay markers when they fall in this visible range.
        const [purchasesData, dividendsData, priceHistoryData] = await Promise.all([
          apiFetch<Purchase[]>(`/purchases?asset_id=${assetId}`),
          apiFetch<DividendEventListResponse>(`/dividends?ticker=${ticker}`),
          apiFetch<HistoricalPricePoint[]>(`/assets/${assetId}/price-history?days=90`),
        ]);

        if (cancelled) return;
        setPurchases(purchasesData);
        setDividends(dividendsData.events);
        setPriceHistory(priceHistoryData);
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
  }, [assetId, ticker]);

  // Build chart data spanning the last 90 days regardless of how many quote
  // points the backend returned. The X axis is bound to [windowStart, windowEnd]
  // so the visible range is always 90 days; missing quotes render as gaps
  // (connectNulls on the Line bridges them visually).
  const { chartData, windowStart, windowEnd, yDomain } = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 90);

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
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10);
      data.push({
        date: iso,
        label: toLabel(cursor),
        timestamp: cursor.getTime(),
        price: priceByDate.get(iso) ?? null,
        purchases: purchasesByDate.get(iso),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    // Compute Y domain from line prices, marker prices and current price so the
    // axis always shows everything visible with a small padding.
    const values: number[] = [];
    for (const d of data) if (d.price != null) values.push(d.price);
    for (const pm of purchaseMarkers) values.push(markerYForPurchase(pm));
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
  }, [priceHistory, purchases, ticker, isNativeView, currentPrice, currentPriceNative]);

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
  // Y-position uses the average purchase unit price so dots sit on the buy level,
  // independent of whether a quote exists for that day. Picks native/BRL based
  // on the active currency.
  const purchaseScatterData = chartData
    .filter((d) => d.purchases && d.purchases.length > 0)
    .map((d) => ({
      ...d,
      markerPrice:
        d.purchases!.reduce(
          (sum, purchase) =>
            sum + (isNativeView ? purchase.unitPriceNative : purchase.price),
          0,
        ) / d.purchases!.length,
    }));

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
            {purchaseScatterData.length > 0 && (
              <Scatter
                data={purchaseScatterData}
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
