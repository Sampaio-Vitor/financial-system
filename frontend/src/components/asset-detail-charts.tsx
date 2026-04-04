"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { DividendEventListResponse, Purchase } from "@/types";

interface AssetDetailChartsProps {
  ticker: string;
  assetId: number;
  currentPrice: number | null;
}

interface PricePoint {
  date: string;
  label: string;
  preco_medio: number;
}

interface DividendPoint {
  date: string;
  label: string;
  acumulado: number;
}

function buildPriceData(
  purchases: Purchase[],
  currentPrice: number | null
): { points: PricePoint[]; currentPriceNum: number | null } {
  if (purchases.length === 0) return { points: [], currentPriceNum: null };

  // Only consider buys for avg price (ignore sells for simplicity of avg calc)
  const sorted = [...purchases].sort(
    (a, b) => a.purchase_date.localeCompare(b.purchase_date)
  );

  let totalCost = 0;
  let totalQty = 0;
  const points: PricePoint[] = [];

  for (const p of sorted) {
    const qty = Number(p.quantity);
    const cost = Number(p.total_value);

    if (qty > 0) {
      // Buy: recalculate weighted average
      totalCost += cost;
      totalQty += qty;
    } else {
      // Sell: reduce position at current avg price (cost basis doesn't change per unit)
      if (totalQty > 0) {
        const avgBefore = totalCost / totalQty;
        totalQty += qty; // qty is negative
        totalCost = totalQty > 0 ? avgBefore * totalQty : 0;
      }
    }

    if (totalQty > 0) {
      const d = new Date(p.purchase_date + "T00:00:00");
      points.push({
        date: p.purchase_date,
        label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        preco_medio: totalCost / totalQty,
      });
    }
  }

  // Extend the avg price line to today so it visually reaches the current price reference
  if (points.length > 0 && currentPrice != null) {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const lastDate = points[points.length - 1].date;
    if (todayStr > lastDate) {
      points.push({
        date: todayStr,
        label: today.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        preco_medio: points[points.length - 1].preco_medio,
      });
    }
  }

  return { points, currentPriceNum: currentPrice != null ? Number(currentPrice) : null };
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

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--color-bg-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "12px",
  },
  labelStyle: { color: "var(--color-text-muted)" },
};

interface HistoricalPricePoint {
  date: string;
  price: number;
}

type ChartView = "preco_medio" | "dividendos" | "cotacao";

export default function AssetDetailCharts({
  ticker,
  assetId,
  currentPrice,
}: AssetDetailChartsProps) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [dividends, setDividends] = useState<DividendEventListResponse["events"]>([]);
  const [priceHistory, setPriceHistory] = useState<HistoricalPricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ChartView>("cotacao");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      apiFetch<Purchase[]>(`/purchases?asset_id=${assetId}`),
      apiFetch<DividendEventListResponse>(`/dividends?ticker=${ticker}`),
      apiFetch<HistoricalPricePoint[]>(`/assets/${assetId}/price-history?days=90`),
    ])
      .then(([purchasesData, dividendsData, priceHistoryData]) => {
        if (cancelled) return;
        setPurchases(purchasesData);
        setDividends(dividendsData.events);
        setPriceHistory(priceHistoryData);
      })
      .catch(() => {
        if (cancelled) return;
        setPurchases([]);
        setDividends([]);
        setPriceHistory([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assetId, ticker]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse h-52 rounded-xl bg-[var(--color-bg-main)]" />
      </div>
    );
  }

  const { points: priceData, currentPriceNum } = buildPriceData(purchases, currentPrice);
  const dividendData = buildDividendData(dividends);
  const hasDividends = dividendData.length > 0;
  const hasPrice = priceData.length > 0;
  const hasPriceHistory = priceHistory.length > 0;

  const priceHistoryChartData = priceHistory.map((p) => {
    const d = new Date(p.date + "T00:00:00");
    return {
      date: p.date,
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      price: p.price,
    };
  });

  if (!hasDividends && !hasPrice && !hasPriceHistory) {
    return (
      <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">
        Sem dados para este ativo.
      </div>
    );
  }

  const lastAvg = hasPrice ? priceData[priceData.length - 1].preco_medio : 0;
  const isAbove = currentPriceNum != null && currentPriceNum >= lastAvg;

  // Available views
  const availableViews: ChartView[] = [];
  if (hasPriceHistory) availableViews.push("cotacao");
  if (hasPrice) availableViews.push("preco_medio");
  if (hasDividends) availableViews.push("dividendos");

  const effectiveView = availableViews.includes(view) ? view : availableViews[0];
  const showToggle = availableViews.length > 1;

  const viewLabels: Record<ChartView, string> = {
    cotacao: "Cotação",
    preco_medio: "Preço Médio",
    dividendos: "Dividendos",
  };

  const viewColors: Record<ChartView, string> = {
    cotacao: "bg-[var(--color-accent)]",
    preco_medio: "bg-[var(--color-accent)]",
    dividendos: "bg-[#10b981]",
  };

  return (
    <div className="p-4">
      {/* Toggle switch */}
      {showToggle && (
        <div className="flex items-center gap-1 mb-3 bg-[var(--color-bg-main)] rounded-lg p-1 w-fit">
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

      {/* Price history chart */}
      {effectiveView === "cotacao" && hasPriceHistory && (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={priceHistoryChartData}>
            <defs>
              <linearGradient id={`grad-hist-${assetId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatBRL(v).replace("R$\u00a0", "R$")}
              width={80}
              domain={["auto", "auto"]}
            />
            <Tooltip
              formatter={(value: number) => [formatBRL(value), "Cotação"]}
              {...tooltipStyle}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="var(--color-accent)"
              fill={`url(#grad-hist-${assetId})`}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* Avg price vs current price chart */}
      {effectiveView === "preco_medio" && hasPrice && (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={priceData}>
            <defs>
              <linearGradient id={`grad-avg-${assetId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
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
              domain={[
                (dataMin: number) => {
                  const min = currentPriceNum != null ? Math.min(dataMin, currentPriceNum) : dataMin;
                  return Math.floor(min * 0.95);
                },
                (dataMax: number) => {
                  const max = currentPriceNum != null ? Math.max(dataMax, currentPriceNum) : dataMax;
                  return Math.ceil(max * 1.05);
                },
              ]}
            />
            <Tooltip
              formatter={(value: number) => [formatBRL(value), "Preco Medio"]}
              {...tooltipStyle}
            />
            <Area
              type="monotone"
              dataKey="preco_medio"
              stroke="var(--color-accent)"
              fill={`url(#grad-avg-${assetId})`}
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--color-accent)" }}
            />
            {currentPriceNum != null && (
              <ReferenceLine
                y={currentPriceNum}
                stroke={isAbove ? "var(--color-positive)" : "var(--color-negative)"}
                strokeDasharray="6 4"
                strokeWidth={2}
                label={{
                  value: `Cotacao: ${formatBRL(currentPriceNum)}`,
                  position: "right",
                  fill: isAbove ? "var(--color-positive)" : "var(--color-negative)",
                  fontSize: 11,
                }}
              />
            )}
          </AreaChart>
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
