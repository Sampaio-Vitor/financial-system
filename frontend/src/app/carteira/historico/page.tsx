"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { DailyEvolutionPoint, PatrimonioEvolutionPoint } from "@/types";

type RangeKey = "1M" | "3M" | "6M" | "1Y" | "ALL";

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "ALL", label: "Tudo", days: 0 },
];
const ALL_DAILY_DAYS = 3650;

interface ChartPoint {
  label: string;
  date: string;
  patrimonio: number;
  investido: number;
  pnl: number;
  pnlPct: number;
}

export default function HistoricoPage() {
  const [range, setRange] = useState<RangeKey>("3M");
  const [dailyData, setDailyData] = useState<DailyEvolutionPoint[]>([]);
  const [monthlyData, setMonthlyData] = useState<PatrimonioEvolutionPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const selectedRange = RANGES.find((r) => r.key === range);
      const days = selectedRange?.days ?? 365;
      const dailyDays = days === 0 ? ALL_DAILY_DAYS : days;
      const [daily, monthly] = await Promise.all([
        apiFetch<DailyEvolutionPoint[]>(`/snapshots/daily-evolution?days=${dailyDays}`),
        apiFetch<PatrimonioEvolutionPoint[]>("/snapshots/evolution"),
      ]);
      setDailyData(daily);
      setMonthlyData(monthly);
    } catch {
      setDailyData([]);
      setMonthlyData([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Merge monthly (historical) + daily (recent) into chart points
  const chartData: ChartPoint[] = [];

  // Add monthly data points
  for (const m of monthlyData) {
    // Skip monthly points that overlap with daily data
    // Monthly month is "YYYY-MM", daily date is "YYYY-MM-DD"
    const hasDaily = dailyData.some((d) => d.date.startsWith(m.month));
    if (!hasDaily) {
      const invested = Number(m.total_invested);
      const pnl = Number(m.total_pnl);
      chartData.push({
        label: m.month.slice(5) + "/" + m.month.slice(2, 4),
        date: m.month + "-15",
        patrimonio: Number(m.total_patrimonio),
        investido: invested,
        pnl,
        pnlPct: invested > 0 ? (pnl / invested) * 100 : 0,
      });
    }
  }

  // Add daily data points
  for (const d of dailyData) {
    const dt = new Date(d.date + "T12:00:00");
    const invested = Number(d.total_invested);
    const pnl = Number(d.total_pnl);
    chartData.push({
      label: dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      date: d.date,
      patrimonio: Number(d.total_patrimonio),
      investido: invested,
      pnl,
      pnlPct: invested > 0 ? (pnl / invested) * 100 : 0,
    });
  }

  // Sort by date
  chartData.sort((a, b) => a.date.localeCompare(b.date));

  // Apply range filter for monthly data
  if (range !== "ALL") {
    const days = RANGES.find((r) => r.key === range)?.days || 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const filtered = chartData.filter((p) => p.date >= cutoffStr);
    chartData.length = 0;
    chartData.push(...filtered);
  }

  const latestPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Histórico do Patrimônio</h1>
      </div>

      {/* Summary cards */}
      {latestPoint && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">Patrimônio Atual</p>
            <p className="text-lg font-bold text-[var(--color-text-primary)]">
              {formatBRL(latestPoint.patrimonio)}
            </p>
          </div>
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">Total Investido</p>
            <p className="text-lg font-bold text-[var(--color-text-primary)]">
              {formatBRL(latestPoint.investido)}
            </p>
          </div>
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">Lucro / Prejuízo</p>
            <p className={`text-lg font-bold ${latestPoint.pnl >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}>
              {formatBRL(latestPoint.pnl)}
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 shadow-sm">
        {/* Range selector */}
        <div className="flex items-center gap-1 mb-4">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                range === r.key
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="h-80 flex items-center justify-center">
            <div className="animate-pulse text-[var(--color-text-muted)]">Carregando...</div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-80 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[var(--color-text-muted)] font-medium">Nenhum dado historico ainda.</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Os dados serao coletados automaticamente todos os dias as 18h (BRT).
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradHistPatrimonio" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e2130",
                      border: "1px solid #2a2d3a",
                      borderRadius: "8px",
                      color: "#f8fafc",
                      fontSize: "12px",
                    }}
                    formatter={(v: number, name: string) => [
                      formatBRL(v),
                      name === "patrimonio"
                        ? "Patrimônio"
                        : name === "investido"
                          ? "Investido"
                          : "Lucro",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="patrimonio"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#gradHistPatrimonio)"
                  />
                  <Area
                    type="monotone"
                    dataKey="investido"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    fill="none"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-3 justify-center">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-emerald-500 rounded" />
                <span className="text-xs text-[var(--color-text-muted)]">Patrimônio</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-violet-500 rounded" style={{ borderTop: "2px dashed #8b5cf6", height: 0 }} />
                <span className="text-xs text-[var(--color-text-muted)]">Investido</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Rendimento (PnL) chart */}
      {!loading && chartData.length > 0 && (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
            Evolução do Rendimento
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#2a2d3a" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e2130",
                    border: "1px solid #2a2d3a",
                    borderRadius: "8px",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                  formatter={(v: number, name: string) => {
                    if (name === "pnlPct") return [`${v.toFixed(2)}%`, "Rendimento %"];
                    return [formatBRL(v), "Rendimento R$"];
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="pnl"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="pnlPct"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3 justify-center">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-emerald-500 rounded" />
              <span className="text-xs text-[var(--color-text-muted)]">Rendimento R$</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-amber-500 rounded" style={{ borderTop: "2px dashed #f59e0b", height: 0 }} />
              <span className="text-xs text-[var(--color-text-muted)]">Rendimento %</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
