"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { formatBRL, formatPercent, getMonthLabel } from "@/lib/format";
import { DailyEvolutionPoint, PatrimonioEvolutionPoint, ClassSummary } from "@/types";
import AllocationDonutChart from "@/components/allocation-donut-chart";
import GeographyDonutChart from "@/components/geography-donut-chart";

const TABS = [
  { key: "evolucao", label: "Evolução" },
  { key: "aporte-vs-patrimonio", label: "Aporte vs Patrimônio" },
  { key: "alocacao", label: "Alocação" },
  { key: "geografia", label: "Geografia" },
] as const;

const GRANULARITIES = [
  { key: "monthly", label: "Mensal" },
  { key: "quarterly", label: "Trimestral" },
  { key: "yearly", label: "Anual" },
] as const;

const RANGES = [
  { key: "1W", label: "1S", days: 7 },
  { key: "1M", label: "1M", days: 30 },
  { key: "YTD", label: "YTD", days: 0 },
  { key: "1Y", label: "1A", days: 365 },
  { key: "5Y", label: "5A", days: 365 * 5 },
  { key: "ALL", label: "Tudo", days: 3650 },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type GranularityKey = (typeof GRANULARITIES)[number]["key"];
type RangeKey = (typeof RANGES)[number]["key"];

interface ChartTabsProps {
  allocationItems: ClassSummary[];
  patrimonioTotal: number;
  reservaFinanceira?: number | null;
}

interface EvolutionChartPoint {
  key: string;
  label: string;
  tooltipLabel: string;
  patrimonio: number;
  investido: number;
  pnl: number;
  pnlPct: number;
}

interface AporteChartPoint {
  key: string;
  label: string;
  tooltipLabel: string;
  aportes: number;
  netAportes: number;
  jaExistente: number;
  patrimonio: number;
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

function getQuarter(month: string): string {
  const year = month.slice(0, 4);
  const monthNumber = Number(month.slice(5, 7));
  const quarter = Math.ceil(monthNumber / 3);
  return `${year}-T${quarter}`;
}

function groupMonthlyData(data: PatrimonioEvolutionPoint[], granularity: GranularityKey) {
  const grouped = new Map<string, PatrimonioEvolutionPoint[]>();

  for (const point of data) {
    const key =
      granularity === "monthly"
        ? point.month
        : granularity === "quarterly"
          ? getQuarter(point.month)
          : point.month.slice(0, 4);
    grouped.set(key, [...(grouped.get(key) ?? []), point]);
  }

  return Array.from(grouped.entries());
}

function getPeriodLabels(
  key: string,
  last: PatrimonioEvolutionPoint,
  granularity: GranularityKey
) {
  const label =
    granularity === "monthly"
      ? `${last.month.slice(5)}/${last.month.slice(2, 4)}`
      : granularity === "quarterly"
        ? key.replace("-T", " T")
        : key;
  const tooltipLabel =
    granularity === "monthly"
      ? getMonthLabel(last.month)
      : granularity === "quarterly"
        ? key.replace("-T", " T")
        : key;

  return { label, tooltipLabel };
}

function aggregateAporteData(
  data: PatrimonioEvolutionPoint[],
  granularity: GranularityKey
): AporteChartPoint[] {
  return groupMonthlyData(data, granularity).map(([key, points]) => {
    const last = points[points.length - 1];
    const patrimonio = Number(last.total_patrimonio);
    const netAportes = points.reduce((sum, point, index) => {
      const fallbackInvested =
        index > 0
          ? Number(point.total_invested) - Number(points[index - 1].total_invested)
          : Number(point.aportes_do_mes ?? point.total_invested);
      return sum + Number(point.aportes_do_mes ?? fallbackInvested);
    }, 0);
    const aportes = Math.max(0, netAportes);
    const { label, tooltipLabel } = getPeriodLabels(key, last, granularity);

    return {
      key,
      label,
      tooltipLabel,
      aportes,
      netAportes,
      jaExistente: Math.max(0, patrimonio - aportes),
      patrimonio,
    };
  });
}

export default function ChartTabs({
  allocationItems,
  patrimonioTotal,
  reservaFinanceira,
}: ChartTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("evolucao");
  const [aporteGranularity, setAporteGranularity] = useState<GranularityKey>("monthly");
  const [range, setRange] = useState<RangeKey>("YTD");
  const [dailyData, setDailyData] = useState<DailyEvolutionPoint[]>([]);
  const [monthlyData, setMonthlyData] = useState<PatrimonioEvolutionPoint[]>([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchDailyEvolution = useCallback(async () => {
    setDailyLoading(true);
    try {
      const result = await apiFetch<DailyEvolutionPoint[]>(
        `/snapshots/daily-evolution?days=${getRangeDays(range)}`
      );
      setDailyData(result);
    } catch {
      setDailyData([]);
    } finally {
      setDailyLoading(false);
    }
  }, [range]);

  const fetchMonthlyEvolution = useCallback(async () => {
    setMonthlyLoading(true);
    try {
      const result = await apiFetch<PatrimonioEvolutionPoint[]>("/snapshots/evolution");
      setMonthlyData(result);
    } catch {
      setMonthlyData([]);
    } finally {
      setMonthlyLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDailyEvolution();
  }, [fetchDailyEvolution]);

  useEffect(() => {
    fetchMonthlyEvolution();
  }, [fetchMonthlyEvolution]);

  const handleGenerateAll = async () => {
    setGenerating(true);
    try {
      await apiFetch("/snapshots/generate-all", { method: "POST" });
      await fetchMonthlyEvolution();
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const dailyChartData = useMemo<EvolutionChartPoint[]>(
    () =>
      dailyData.map((point) => {
        const date = new Date(`${point.date}T12:00:00`);
        const invested = Number(point.total_invested);
        const patrimonio = Number(point.total_patrimonio);
        const pnl = Number(point.total_pnl);

        return {
          key: point.date,
          label: date.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
          }),
          tooltipLabel: date.toLocaleDateString("pt-BR"),
          patrimonio,
          investido: invested,
          pnl,
          pnlPct: invested > 0 ? (pnl / invested) * 100 : Number(point.pnl_pct),
        };
      }),
    [dailyData]
  );

  const aporteChartData = useMemo<AporteChartPoint[]>(
    () => aggregateAporteData(monthlyData, aporteGranularity),
    [aporteGranularity, monthlyData]
  );

  const latestPoint = dailyChartData.at(-1);
  const firstPoint = dailyChartData[0];
  const periodChange =
    latestPoint && firstPoint && firstPoint.patrimonio > 0
      ? ((latestPoint.patrimonio - firstPoint.patrimonio) / firstPoint.patrimonio) * 100
      : null;
  const isPositive = (latestPoint?.pnl ?? 0) >= 0;

  const renderEmptyState = () => (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-medium text-[var(--color-text-muted)]">
        Nenhum snapshot histórico gerado
      </p>
      <button
        onClick={handleGenerateAll}
        disabled={generating}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
      >
        {generating ? "Gerando snapshots..." : "Gerar Snapshots Históricos"}
      </button>
      {generating && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Isso pode levar alguns minutos...
        </p>
      )}
    </div>
  );

  const renderEvolutionChart = () => {
    if (dailyLoading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-500" />
        </div>
      );
    }

    if (dailyChartData.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center text-center">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-muted)]">
              Nenhum snapshot diário encontrado.
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Os pontos aparecem após a coleta diária de patrimônio.
            </p>
          </div>
        </div>
      );
    }

    const commonAxis = {
      tick: { fontSize: 11, fill: "#64748b" },
      axisLine: false,
      tickLine: false,
    };

    const tooltip = (
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
        labelFormatter={(_label: string, payload: unknown) => {
          const items = payload as Array<{ payload: EvolutionChartPoint }>;
          return items?.[0]?.payload.tooltipLabel ?? _label;
        }}
      />
    );

    return (
      <LineChart data={dailyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="label"
          {...commonAxis}
          axisLine={{ stroke: "#2a2d3a" }}
          interval="preserveStartEnd"
          minTickGap={18}
        />
        <YAxis
          {...commonAxis}
          tickFormatter={formatAxisValue}
          width={42}
        />
        {tooltip}
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
    );
  };

  const renderEvolutionArea = () => {
    if (dailyLoading || dailyChartData.length === 0) {
      return renderEvolutionChart();
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        {renderEvolutionChart()}
      </ResponsiveContainer>
    );
  };

  const renderAporteChart = () => {
    if (monthlyLoading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-500" />
        </div>
      );
    }

    if (aporteChartData.length === 0) {
      return renderEmptyState();
    }

    return (
      <>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Aporte vs Patrimônio
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Patrimônio existente e aporte líquido por período
            </p>
          </div>

          <div className="flex w-full gap-1 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-1 sm:w-auto">
            {GRANULARITIES.map((item) => (
              <button
                key={item.key}
                onClick={() => setAporteGranularity(item.key)}
                className={`min-h-8 min-w-20 rounded-md px-2.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset ${
                  aporteGranularity === item.key
                    ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={aporteChartData}
              margin={{ top: 8, right: 8, bottom: 0, left: -10 }}
              barCategoryGap="28%"
            >
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#2a2d3a" }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={18}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatAxisValue}
                width={44}
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
                  name === "aportes" ? "Aporte Líquido" : "Patrimônio Existente",
                ]}
                labelFormatter={(_label: string, payload: unknown) => {
                  const items = payload as Array<{ payload: AporteChartPoint }>;
                  const point = items?.[0]?.payload;
                  if (!point) return _label;
                  return `${point.tooltipLabel} - Total: ${formatBRL(point.patrimonio)} - Aporte líquido: ${formatBRL(point.netAportes)}`;
                }}
              />
              <Bar dataKey="jaExistente" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="aportes" stackId="a" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-emerald-500" />
            <span className="text-xs text-[var(--color-text-muted)]">Patrimônio Existente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-violet-500" />
            <span className="text-xs text-[var(--color-text-muted)]">Aporte Líquido</span>
          </div>
        </div>
      </>
    );
  };

  const renderTabContent = () => {
    if (activeTab === "alocacao") {
      return (
        <AllocationDonutChart
          items={allocationItems}
          patrimonioTotal={patrimonioTotal}
        />
      );
    }

    if (activeTab === "geografia") {
      return (
        <GeographyDonutChart
          items={allocationItems}
          patrimonioTotal={patrimonioTotal}
          reservaFinanceira={reservaFinanceira}
        />
      );
    }

    if (activeTab === "aporte-vs-patrimonio") {
      return renderAporteChart();
    }

    return (
      <>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
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

          <div className="flex w-full gap-1 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-1 sm:w-auto">
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

        <div className="min-h-0 flex-1">
          {renderEvolutionArea()}
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
    );
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 shadow-sm md:p-5">
      <div className="mb-5">
        <label className="block md:hidden">
          <span className="sr-only">Selecionar gráfico</span>
          <select
            value={activeTab}
            onChange={(event) => setActiveTab(event.target.value as TabKey)}
            className="h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-sm font-medium text-[var(--color-text-primary)]"
          >
            {TABS.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.label}
              </option>
            ))}
          </select>
        </label>

        <div className="hidden min-w-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-1 md:block">
          <div className="grid min-w-0 grid-cols-4 gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-10 min-w-0 rounded-md px-3 py-2 text-center text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset ${
                  activeTab === tab.key
                    ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                <span className="block truncate">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex h-[380px] flex-col md:h-[460px]">
        {renderTabContent()}
      </div>
    </div>
  );
}
