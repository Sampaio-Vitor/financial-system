"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { DividendEventListResponse, DividendEvent } from "@/types";

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const EVENT_TYPE_PALETTE = [
  "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4", "#f43f5e", "#71717a",
];

const TICKER_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#71717a",
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#1e2130",
    border: "1px solid #2a2d3a",
    borderRadius: "8px",
    color: "#f8fafc",
    fontSize: "12px",
  },
  itemStyle: { color: "#f8fafc" },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  DIVIDEND: "Dividendo",
  JCP: "JCP",
  RENDIMENTO: "Rendimento",
};

function getEventTypeLabel(type: string) {
  return EVENT_TYPE_LABELS[type] || type.charAt(0) + type.slice(1).toLowerCase();
}

export default function ProventosPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [events, setEvents] = useState<DividendEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tickerFilter, setTickerFilter] = useState("");

  // Year options: current year down to 5 years ago
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  useEffect(() => {
    setLoading(true);
    apiFetch<DividendEventListResponse>(`/dividends?year=${year}`)
      .then((data) => setEvents(data.events))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [year]);

  // --- Computed data ---
  const totalReceived = useMemo(
    () => events.reduce((sum, e) => sum + Number(e.credited_amount), 0),
    [events]
  );

  const totalCount = events.length;

  const topPayer = useMemo(() => {
    if (events.length === 0) return null;
    const byTicker: Record<string, number> = {};
    for (const e of events) {
      const t = e.ticker || "?";
      byTicker[t] = (byTicker[t] || 0) + Number(e.credited_amount);
    }
    const sorted = Object.entries(byTicker).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? { ticker: sorted[0][0], total: sorted[0][1] } : null;
  }, [events]);

  // Discover unique event types and assign colors
  const eventTypeColors = useMemo(() => {
    const types = Array.from(new Set(events.map((e) => e.event_type)));
    const colors: Record<string, string> = {};
    types.forEach((t, i) => {
      colors[t] = EVENT_TYPE_PALETTE[i % EVENT_TYPE_PALETTE.length];
    });
    return colors;
  }, [events]);

  const activeTypes = useMemo(() => Object.keys(eventTypeColors), [eventTypeColors]);

  // Bar chart: monthly by event type + accumulated line
  const monthlyData = useMemo(() => {
    const data = MONTH_LABELS.map((label) => {
      const row: Record<string, number | string | null> = { month: label, acumulado: null };
      for (const t of activeTypes) row[t] = 0;
      return row;
    });

    // Track which months have events
    const monthsWithEvents = new Set<number>();
    for (const e of events) {
      const monthIdx = new Date(e.payment_date + "T00:00:00").getMonth();
      monthsWithEvents.add(monthIdx);
      const type = e.event_type;
      data[monthIdx][type] = ((data[monthIdx][type] as number) || 0) + Number(e.credited_amount);
    }

    // Compute running accumulated total — only from first event month to last
    if (monthsWithEvents.size > 0) {
      const firstMonth = Math.min(...monthsWithEvents);
      const lastMonth = Math.max(...monthsWithEvents);
      let acc = 0;
      for (let i = firstMonth; i <= lastMonth; i++) {
        for (const t of activeTypes) acc += (data[i][t] as number) || 0;
        data[i].acumulado = acc;
      }
    }

    return data;
  }, [events, activeTypes]);

  // Donut: by ticker (top 5 + outros)
  const donutData = useMemo(() => {
    const byTicker: Record<string, number> = {};
    for (const e of events) {
      const t = e.ticker || "?";
      byTicker[t] = (byTicker[t] || 0) + Number(e.credited_amount);
    }
    const sorted = Object.entries(byTicker).sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);
    const othersTotal = sorted.slice(5).reduce((sum, [, v]) => sum + v, 0);

    const result = top5.map(([name, value], i) => ({
      name,
      value,
      color: TICKER_COLORS[i],
    }));

    if (othersTotal > 0) {
      result.push({ name: "Outros", value: othersTotal, color: TICKER_COLORS[5] });
    }

    return result;
  }, [events]);

  // Filtered events for table
  const filteredEvents = useMemo(() => {
    if (!tickerFilter) return events;
    const filter = tickerFilter.toUpperCase();
    return events.filter((e) => e.ticker?.includes(filter));
  }, [events, tickerFilter]);

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-6">Proventos</h1>
        <div className="space-y-4">
          <div className="animate-pulse h-24 rounded-xl bg-[var(--color-bg-card)]" />
          <div className="animate-pulse h-72 rounded-xl bg-[var(--color-bg-card)]" />
          <div className="animate-pulse h-64 rounded-xl bg-[var(--color-bg-card)]" />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Proventos</h1>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)]"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Total Recebido</span>
          <div className="text-2xl font-bold text-[var(--color-positive)] mt-1">
            {formatBRL(totalReceived)}
          </div>
        </div>
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Eventos</span>
          <div className="text-2xl font-bold text-[var(--color-text-primary)] mt-1">
            {totalCount}
          </div>
        </div>
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Maior Pagador</span>
          <div className="mt-1">
            {topPayer ? (
              <>
                <span className="text-2xl font-bold text-[var(--color-text-primary)]">{topPayer.ticker}</span>
                <span className="text-sm text-[var(--color-text-muted)] ml-2">{formatBRL(topPayer.total)}</span>
              </>
            ) : (
              <span className="text-[var(--color-text-muted)]">—</span>
            )}
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-muted)]">Nenhum provento registrado em {year}.</p>
        </div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Monthly bar chart */}
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
                Proventos por Mes
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatBRL(v).replace("R$\u00a0", "R$")}
                    width={80}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatBRL(v).replace("R$\u00a0", "R$")}
                    width={80}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatBRL(value),
                      name === "acumulado" ? "Acumulado" : getEventTypeLabel(name),
                    ]}
                    {...tooltipStyle}
                  />
                  <Legend
                    formatter={(value: string) => value === "acumulado" ? "Acumulado" : getEventTypeLabel(value)}
                    wrapperStyle={{ fontSize: "11px" }}
                  />
                  {activeTypes.map((type, i) => (
                    <Bar
                      key={type}
                      dataKey={type}
                      stackId="a"
                      yAxisId="left"
                      fill={eventTypeColors[type]}
                      radius={i === activeTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="acumulado"
                    yAxisId="right"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#f59e0b" }}
                    legendType="line"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Donut by ticker */}
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
                Distribuicao por Ativo
              </h3>
              <div className="flex items-center gap-4">
                <div className="relative flex-1" style={{ minHeight: 220 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius="55%"
                        outerRadius="85%"
                        dataKey="value"
                        strokeWidth={2}
                        stroke="var(--color-bg-card)"
                      >
                        {donutData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [formatBRL(value), name]}
                        {...tooltipStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs text-[var(--color-text-muted)]">Total</span>
                    <span className="text-sm font-bold text-[var(--color-text-primary)]">
                      {formatBRL(totalReceived)}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 shrink-0">
                  {donutData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                      <div className="text-xs">
                        <span className="text-[var(--color-text-secondary)] font-medium">{entry.name}</span>
                        <span className="text-[var(--color-text-muted)] ml-1.5">{formatBRL(entry.value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Events table */}
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Eventos ({filteredEvents.length})
              </h3>
              <input
                type="text"
                placeholder="Filtrar por ticker..."
                value={tickerFilter}
                onChange={(e) => setTickerFilter(e.target.value)}
                className="bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-muted)] w-48"
              />
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[var(--color-border)]">
              {filteredEvents.map((e) => (
                <div key={e.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-[var(--color-text-primary)]">
                      {e.ticker || "—"}
                    </span>
                    <span className="text-sm font-semibold text-[var(--color-positive)]">
                      {formatBRL(Number(e.credited_amount))}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {new Date(e.payment_date + "T00:00:00").toLocaleDateString("pt-BR")}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--color-bg-main)]/30">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-muted)]">Data</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-muted)]">Ticker</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-muted)]">Bruto</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-muted)]">IR Retido</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-muted)]">Liquido</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((e) => (
                    <tr key={e.id} className="border-t border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50">
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                        {new Date(e.payment_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{e.ticker || "—"}</td>
                      <td className="px-4 py-2.5 text-right text-[var(--color-text-secondary)]">
                        {e.gross_amount ? formatBRL(Number(e.gross_amount)) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[var(--color-negative)]">
                        {e.withholding_tax ? formatBRL(Number(e.withholding_tax)) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-[var(--color-positive)]">
                        {formatBRL(Number(e.credited_amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredEvents.length === 0 && (
              <div className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                Nenhum evento encontrado.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
