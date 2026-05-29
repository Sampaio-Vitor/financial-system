"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { formatBRL, formatPercent } from "@/lib/format";
import { DailyEvolutionPoint } from "@/types";

type RangeKey = "1W" | "1M" | "YTD" | "1Y" | "5Y" | "ALL";

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "1W", label: "1S", days: 7 },
  { key: "1M", label: "1M", days: 30 },
  { key: "YTD", label: "YTD", days: 0 },
  { key: "1Y", label: "1A", days: 365 },
  { key: "5Y", label: "5A", days: 365 * 5 },
  { key: "ALL", label: "Tudo", days: 3650 },
];

interface ChartPoint {
  date: string;
  label: string;
  patrimonio: number;
  investido: number;
  pnl: number;
  pnlPct: number;
}

function getRangeDays(range: RangeKey): number {
  if (range !== "YTD") {
    return RANGES.find((item) => item.key === range)?.days ?? 365;
  }

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const diffMs = now.getTime() - startOfYear.getTime();
  return Math.max(1, Math.ceil(diffMs / 86_400_000));
}

function formatAxisValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return value.toFixed(0);
}

export default function PatrimonioDailyEvolutionChart() {
  const [range, setRange] = useState<RangeKey>("YTD");
  const [data, setData] = useState<DailyEvolutionPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<DailyEvolutionPoint[]>(
        `/snapshots/daily-evolution?days=${getRangeDays(range)}`
      );
      setData(result);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartData = useMemo<ChartPoint[]>(
    () =>
      data.map((point) => {
        const date = new Date(`${point.date}T12:00:00`);
        const invested = Number(point.total_invested);
        const patrimonio = Number(point.total_patrimonio);
        const pnl = Number(point.total_pnl);

        return {
          date: point.date,
          label: date.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
          }),
          patrimonio,
          investido: invested,
          pnl,
          pnlPct: invested > 0 ? (pnl / invested) * 100 : Number(point.pnl_pct),
        };
      }),
    [data]
  );

  const latestPoint = chartData.at(-1);
  const firstPoint = chartData[0];
  const periodChange =
    latestPoint && firstPoint && firstPoint.patrimonio > 0
      ? ((latestPoint.patrimonio - firstPoint.patrimonio) / firstPoint.patrimonio) * 100
      : null;
  const isPositive = (latestPoint?.pnl ?? 0) >= 0;

  return (
    <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 md:p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Evolução do Patrimônio
          </h2>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm text-[var(--color-text-secondary)]">
              Atual vs. investido
            </span>
            {latestPoint && (
              <span
                className={`text-sm font-semibold ${
                  isPositive ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"
                }`}
              >
                {formatBRL(latestPoint.pnl)} ({formatPercent(latestPoint.pnlPct)})
              </span>
            )}
            {periodChange !== null && (
              <span className="text-xs text-[var(--color-text-muted)]">
                Periodo: {formatPercent(periodChange)}
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full gap-1 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-1 md:w-auto">
          {RANGES.map((item) => (
            <button
              key={item.key}
              onClick={() => setRange(item.key)}
              className={`min-h-8 min-w-10 rounded-md px-2.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset ${
                range === item.key
                  ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-72 items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-center">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-muted)]">
              Nenhum snapshot diário encontrado.
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Os pontos aparecem após a coleta diária de patrimônio.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="h-72 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#2a2d3a" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatAxisValue}
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e2130",
                    border: "1px solid #2a2d3a",
                    borderRadius: "8px",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                  formatter={(value: number, name: string) => [
                    formatBRL(value),
                    name === "patrimonio" ? "Atual" : "Investido",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="patrimonio"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="investido"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="5 5"
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-4 rounded bg-emerald-500" />
              <span className="text-xs text-[var(--color-text-muted)]">Atual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0 w-4 border-t-2 border-dashed border-blue-500" />
              <span className="text-xs text-[var(--color-text-muted)]">Investido</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
