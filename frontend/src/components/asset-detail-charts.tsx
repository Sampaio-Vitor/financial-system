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

type ChartView = "preco_medio" | "dividendos";

export default function AssetDetailCharts({
  ticker,
  assetId,
  currentPrice,
}: AssetDetailChartsProps) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [dividends, setDividends] = useState<DividendEventListResponse["events"]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ChartView>("preco_medio");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      apiFetch<Purchase[]>(`/purchases?asset_id=${assetId}`),
      apiFetch<DividendEventListResponse>(`/dividends?ticker=${ticker}`),
    ])
      .then(([purchasesData, dividendsData]) => {
        if (cancelled) return;
        setPurchases(purchasesData);
        setDividends(dividendsData.events);
      })
      .catch(() => {
        if (cancelled) return;
        setPurchases([]);
        setDividends([]);
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

  if (!hasDividends && !hasPrice) {
    return (
      <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">
        Sem dados de aportes ou proventos para este ativo.
      </div>
    );
  }

  const lastAvg = hasPrice ? priceData[priceData.length - 1].preco_medio : 0;
  const isAbove = currentPriceNum != null && currentPriceNum >= lastAvg;

  // If only one view has data, force that view
  const effectiveView = !hasPrice ? "dividendos" : !hasDividends ? "preco_medio" : view;
  const showToggle = hasPrice && hasDividends;

  return (
    <div className="p-4">
      {/* Toggle switch */}
      {showToggle && (
        <div className="flex items-center gap-1 mb-3 bg-[var(--color-bg-main)] rounded-lg p-1 w-fit">
          <button
            onClick={(e) => { e.stopPropagation(); setView("preco_medio"); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              effectiveView === "preco_medio"
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            Preco Medio
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setView("dividendos"); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              effectiveView === "dividendos"
                ? "bg-[#10b981] text-white"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            Dividendos
          </button>
        </div>
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
