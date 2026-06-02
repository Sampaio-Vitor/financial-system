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
import Link from "next/link";
import { Plug, CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
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

const TAB_OPTIONS = [
  { id: "recebidos", label: "Recebidos" },
  { id: "previstos", label: "Previstos" },
] as const;

type ProventosTab = (typeof TAB_OPTIONS)[number]["id"];

function getEventTypeLabel(type: string) {
  return EVENT_TYPE_LABELS[type] || type.charAt(0) + type.slice(1).toLowerCase();
}

export default function ProventosPage() {
  const currentYear = new Date().getFullYear();
  const [activeTab, setActiveTab] = useState<ProventosTab>("recebidos");
  const [year, setYear] = useState(currentYear);
  const [events, setEvents] = useState<DividendEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tickerFilter, setTickerFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  // Per-column table filters
  const [paymentFilter, setPaymentFilter] = useState("");
  const [exDateFilter, setExDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [grossMin, setGrossMin] = useState("");
  const [taxMin, setTaxMin] = useState("");
  const [netMin, setNetMin] = useState("");
  const [sortKey, setSortKey] = useState<
    "payment_date" | "ex_date" | "ticker" | "status" | "gross" | "tax" | "net" | null
  >(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: NonNullable<typeof sortKey>) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const [donutExpanded, setDonutExpanded] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [expandedPanel, setExpandedPanel] = useState<"calendario" | "barras" | "donut" | null>(null);

  const togglePanel = (p: "calendario" | "barras" | "donut") =>
    setExpandedPanel((prev) => (prev === p ? null : p));

  useEffect(() => {
    if (!expandedPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedPanel]);

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
    setTypeFilter(new Set());
    setDonutExpanded(false);
    apiFetch<DividendEventListResponse>(`/dividends?year=${year}&tab=${activeTab}`)
      .then((data) => setEvents(data.events))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [year, activeTab]);

  // Events scoped by the active event-type filter (empty set = all types)
  const scopedEvents = useMemo(
    () => (typeFilter.size === 0 ? events : events.filter((e) => typeFilter.has(e.event_type))),
    [events, typeFilter]
  );

  // --- Computed data ---
  const totalReceived = useMemo(
    () => scopedEvents.reduce((sum, e) => sum + Number(e.credited_amount), 0),
    [scopedEvents]
  );

  const totalGross = useMemo(
    () => scopedEvents.reduce((sum, e) => sum + Number(e.gross_amount ?? e.credited_amount), 0),
    [scopedEvents]
  );

  const totalTax = useMemo(
    () => scopedEvents.reduce((sum, e) => sum + Number(e.withholding_tax ?? 0), 0),
    [scopedEvents]
  );

  const topPayer = useMemo(() => {
    if (scopedEvents.length === 0) return null;
    const byTicker: Record<string, number> = {};
    for (const e of scopedEvents) {
      const t = e.ticker || "?";
      byTicker[t] = (byTicker[t] || 0) + Number(e.credited_amount);
    }
    const sorted = Object.entries(byTicker).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? { ticker: sorted[0][0], total: sorted[0][1] } : null;
  }, [scopedEvents]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "previstos") {
      setActiveTab("previstos");
    }
  }, []);

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

  const fmtMini = (v: number) =>
    v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${Math.round(v)}`;

  const isTypeOn = (t: string) => typeFilter.size === 0 || typeFilter.has(t);

  const toggleType = (t: string) => {
    setDonutExpanded(false);
    setTypeFilter((prev) => {
      const all = activeTypes;
      let next: Set<string>;
      if (prev.size === 0) {
        next = new Set(all.filter((x) => x !== t));
      } else {
        next = new Set(prev);
        if (next.has(t)) next.delete(t);
        else next.add(t);
      }
      // empty or "everything selected" both mean no filter
      if (next.size === 0 || next.size === all.length) return new Set();
      return next;
    });
  };

  // Bar chart: monthly by event type + accumulated line
  const monthlyData = useMemo(() => {
    const data = MONTH_LABELS.map((label) => {
      const row: Record<string, number | string | null> = { month: label, acumulado: null };
      for (const t of activeTypes) row[t] = 0;
      return row;
    });

    // Track which months have events
    const monthsWithEvents = new Set<number>();
    for (const e of scopedEvents) {
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
  }, [scopedEvents, activeTypes]);

  // Donut: by ticker. Collapsed = top 5 + Outros; expanded = every ticker.
  const donutData = useMemo(() => {
    const byTicker: Record<string, number> = {};
    for (const e of scopedEvents) {
      const t = e.ticker || "?";
      byTicker[t] = (byTicker[t] || 0) + Number(e.credited_amount);
    }
    const sorted = Object.entries(byTicker).sort((a, b) => b[1] - a[1]);

    const colorAt = (i: number) => TICKER_COLORS[i % TICKER_COLORS.length];

    if (donutExpanded) {
      return sorted.map(([name, value], i) => ({ name, value, color: colorAt(i) }));
    }

    const top5 = sorted.slice(0, 5);
    const othersTotal = sorted.slice(5).reduce((sum, [, v]) => sum + v, 0);
    const result = top5.map(([name, value], i) => ({ name, value, color: colorAt(i) }));
    if (othersTotal > 0) {
      result.push({ name: "Outros", value: othersTotal, color: TICKER_COLORS[5] });
    }
    return result;
  }, [scopedEvents, donutExpanded]);

  // Clicking a donut slice/legend: "Outros" expands the breakdown, a ticker
  // toggles the table/calendar filter for that ticker.
  const handleSliceClick = (name: string) => {
    if (name === "Outros") {
      setDonutExpanded(true);
      return;
    }
    setTickerFilter((prev) => (prev.toUpperCase() === name ? "" : name));
  };

  // Filtered events for table/calendar (scoped + ticker text filter)
  const filteredEvents = useMemo(() => {
    if (!tickerFilter) return scopedEvents;
    const filter = tickerFilter.toUpperCase();
    return scopedEvents.filter((e) => e.ticker?.includes(filter));
  }, [scopedEvents, tickerFilter]);

  // Distinct status values for the status dropdown
  const statusOptions = useMemo(
    () => Array.from(new Set(scopedEvents.map((e) => e.status).filter(Boolean))).sort(),
    [scopedEvents]
  );

  const grossOf = (e: DividendEvent) => Number(e.gross_amount ?? e.credited_amount);
  const taxOf = (e: DividendEvent) => Number(e.withholding_tax ?? 0);
  const netOf = (e: DividendEvent) => Number(e.credited_amount);

  // Table view: filteredEvents + per-column filters + sorting (charts/calendar untouched)
  const tableEvents = useMemo(() => {
    const gMin = parseFloat(grossMin);
    const tMin = parseFloat(taxMin);
    const nMin = parseFloat(netMin);
    const fmtDate = (d?: string | null) =>
      d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "";

    const filtered = filteredEvents.filter((e) => {
      if (paymentFilter && !fmtDate(e.payment_date).includes(paymentFilter)) return false;
      if (exDateFilter && !fmtDate(e.ex_date).includes(exDateFilter)) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      if (!Number.isNaN(gMin) && grossOf(e) < gMin) return false;
      if (!Number.isNaN(tMin) && taxOf(e) < tMin) return false;
      if (!Number.isNaN(nMin) && netOf(e) < nMin) return false;
      return true;
    });

    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    const valueOf = (e: DividendEvent): string | number => {
      switch (sortKey) {
        case "payment_date": return e.payment_date || "";
        case "ex_date": return e.ex_date || "";
        case "ticker": return e.ticker || "";
        case "status": return e.status || "";
        case "gross": return grossOf(e);
        case "tax": return taxOf(e);
        case "net": return netOf(e);
      }
    };
    return [...filtered].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filteredEvents, paymentFilter, exDateFilter, statusFilter, grossMin, taxMin, netMin, sortKey, sortDir]);

  // Calendar: events grouped by payment day, plus the month grid + month total
  const eventsByDay = useMemo(() => {
    const map: Record<string, DividendEvent[]> = {};
    for (const e of filteredEvents) {
      (map[e.payment_date] ||= []).push(e);
    }
    return map;
  }, [filteredEvents]);

  const calendarWeeks = useMemo(() => {
    const startDow = new Date(year, calMonth, 1).getDay();
    const daysInMonth = new Date(year, calMonth + 1, 0).getDate();
    const cells: ({ day: number; dateStr: string } | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, dateStr });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [year, calMonth]);

  const calMonthTotal = useMemo(
    () =>
      filteredEvents
        .filter((e) => new Date(e.payment_date + "T00:00:00").getMonth() === calMonth)
        .reduce((sum, e) => sum + Number(e.credited_amount), 0),
    [filteredEvents, calMonth]
  );

  const todayStr = new Date().toISOString().slice(0, 10);

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
        <div>
          <h1 className="text-xl font-bold">Proventos</h1>
          <div className="mt-3 inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
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
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
            {activeTab === "recebidos" ? "Líquido Recebido" : "Líquido Previsto"}
          </span>
          <div className="text-2xl font-bold text-[var(--color-positive)] mt-1">
            {formatBRL(totalReceived)}
          </div>
        </div>
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
            Imposto {activeTab === "recebidos" ? "Retido" : "Estimado"}
          </span>
          <div className="text-2xl font-bold text-[var(--color-text-primary)] mt-1">
            {formatBRL(totalTax)}
          </div>
        </div>
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Bruto</span>
          <div className="mt-1">
            <span className="text-2xl font-bold text-[var(--color-text-primary)]">{formatBRL(totalGross)}</span>
            {topPayer && (
              <span className="text-sm text-[var(--color-text-muted)] ml-2">
                Maior: {topPayer.ticker}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Event-type filter */}
      {activeTypes.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mr-1">
            Tipo
          </span>
          {activeTypes.map((t) => {
            const on = isTypeOn(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  on
                    ? "border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)]"
                    : "border-transparent bg-transparent text-[var(--color-text-muted)] opacity-50"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: eventTypeColors[t] }}
                />
                {getEventTypeLabel(t)}
              </button>
            );
          })}
        </div>
      )}

      {events.length === 0 ? (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-[var(--color-accent)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plug size={28} className="text-[var(--color-accent)]" />
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Nenhum provento {activeTab === "recebidos" ? "recebido" : "previsto"} em {year}.
          </p>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">
            Conecte um banco em <strong>Conexões Bancárias</strong> para detectar proventos automaticamente.
          </p>
          <Link
            href="/carteira/conexoes"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90"
          >
            <Plug size={16} />
            Conexões Bancárias
          </Link>
        </div>
      ) : (
        <>
          {/* Condensed panel selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {/* Calendar tile */}
            <button
              type="button"
              onClick={() => togglePanel("calendario")}
              className={`text-left rounded-2xl border p-4 transition-colors ${
                expandedPanel === "calendario"
                  ? "border-[var(--color-accent)] bg-[var(--color-bg-card)]"
                  : "border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-text-muted)]"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays size={15} className="text-[var(--color-accent)]" />
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Calendário
                </span>
                <span className="ml-auto text-xs font-semibold text-[var(--color-positive)]">
                  {formatBRL(calMonthTotal)}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {calendarWeeks.flat().map((cell, i) => {
                  if (!cell) return <div key={`mc-${i}`} className="h-6" />;
                  const de = eventsByDay[cell.dateStr] || [];
                  const tot = de.reduce((s, e) => s + Number(e.credited_amount), 0);
                  return (
                    <div
                      key={cell.dateStr}
                      className={`h-6 rounded flex flex-col items-center justify-center leading-none ${
                        de.length ? "bg-[var(--color-bg-main)]" : ""
                      }`}
                    >
                      <span className="text-[8px] text-[var(--color-text-muted)]">{cell.day}</span>
                      {de.length > 0 && (
                        <span className="text-[8px] text-[var(--color-positive)] font-medium">
                          {fmtMini(tot)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </button>

            {/* Monthly bars tile */}
            <button
              type="button"
              onClick={() => togglePanel("barras")}
              className={`text-left rounded-2xl border p-4 transition-colors ${
                expandedPanel === "barras"
                  ? "border-[var(--color-accent)] bg-[var(--color-bg-card)]"
                  : "border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-text-muted)]"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {activeTab === "recebidos" ? "Recebidos por Mês" : "Previstos por Mês"}
                </span>
                <span className="ml-auto text-xs font-semibold text-[var(--color-positive)]">
                  {formatBRL(totalReceived)}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={150} className="pointer-events-none">
                <ComposedChart data={monthlyData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  {activeTypes.map((type, i) => (
                    <Bar
                      key={type}
                      dataKey={type}
                      stackId="a"
                      fill={eventTypeColors[type]}
                      radius={i === activeTypes.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </button>

            {/* Distribution tile */}
            <button
              type="button"
              onClick={() => togglePanel("donut")}
              className={`text-left rounded-2xl border p-4 transition-colors ${
                expandedPanel === "donut"
                  ? "border-[var(--color-accent)] bg-[var(--color-bg-card)]"
                  : "border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-text-muted)]"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Distribuição
                </span>
                {topPayer && (
                  <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                    Maior: {topPayer.ticker}
                  </span>
                )}
              </div>
              <div className="relative pointer-events-none" style={{ height: 150 }}>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius="58%"
                      outerRadius="88%"
                      dataKey="value"
                      strokeWidth={2}
                      stroke="var(--color-bg-card)"
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-[var(--color-text-primary)]">
                    {formatBRL(totalReceived)}
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* Expanded panel modal */}
          {expandedPanel && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setExpandedPanel(null)}
          >
          <div
            className="relative w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
          <button
            type="button"
            onClick={() => setExpandedPanel(null)}
            aria-label="Fechar"
            className="absolute -top-3 -right-3 z-20 w-8 h-8 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <X size={16} />
          </button>
          <div className="max-h-[88vh] overflow-y-auto rounded-2xl">

          {/* Dividend calendar */}
          {expandedPanel === "calendario" && (
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-[var(--color-accent)]" />
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Calendário de Proventos
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalMonth((m) => Math.max(0, m - 1))}
                  disabled={calMonth === 0}
                  className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="text-center min-w-[110px]">
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {MONTH_LABELS[calMonth]} {year}
                  </div>
                  <div className="text-xs text-[var(--color-positive)] font-medium">
                    {formatBRL(calMonthTotal)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCalMonth((m) => Math.min(11, m + 1))}
                  disabled={calMonth === 11}
                  className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] disabled:opacity-30"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Weekday labels */}
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div key={d} className="text-center text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarWeeks.flat().map((cell, i) => {
                if (!cell) return <div key={`empty-${i}`} className="min-h-[92px]" />;
                const dayEvents = eventsByDay[cell.dateStr] || [];
                const isToday = cell.dateStr === todayStr;
                const dayTotal = dayEvents.reduce((s, e) => s + Number(e.credited_amount), 0);
                return (
                  <div
                    key={cell.dateStr}
                    className={`min-h-[92px] rounded-lg border p-2 flex flex-col ${
                      dayEvents.length
                        ? "border-[var(--color-border)] bg-[var(--color-bg-main)]"
                        : "border-transparent"
                    }`}
                  >
                    <div
                      className={`text-xs mb-1 ${
                        isToday
                          ? "font-bold text-[var(--color-accent)]"
                          : "text-[var(--color-text-muted)]"
                      }`}
                    >
                      {cell.day}
                    </div>
                    <div className="space-y-0.5 flex-1">
                      {dayEvents.slice(0, 3).map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center justify-between gap-1 text-[11px] leading-tight"
                          title={`${e.ticker} · ${formatBRL(Number(e.credited_amount))}`}
                        >
                          <span className="text-[var(--color-text-secondary)] truncate">{e.ticker}</span>
                          <span className="text-[var(--color-positive)] shrink-0">
                            {formatBRL(Number(e.credited_amount)).replace("R$ ", "R$")}
                          </span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-[var(--color-text-muted)] leading-tight">
                          +{dayEvents.length - 3} mais
                        </div>
                      )}
                    </div>
                    {dayEvents.length > 1 && (
                      <div className="mt-1 pt-1 border-t border-[var(--color-border)]/60 text-right text-[11px] font-semibold text-[var(--color-positive)] truncate">
                        {formatBRL(dayTotal).replace("R$ ", "R$")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* Monthly bar chart (expanded) */}
          {expandedPanel === "barras" && (
          <div>
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
                {activeTab === "recebidos" ? "Recebidos por Mês" : "Previstos por Mês"}
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
                      fill={eventTypeColors[type]}
                      radius={i === activeTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="acumulado"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#f59e0b" }}
                    legendType="line"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          )}

          {/* Donut by ticker (expanded) */}
          {expandedPanel === "donut" && (
          <div>
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
                Distribuição por Ativo
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
                        onClick={(d: { name?: string }) => d?.name && handleSliceClick(d.name)}
                        className="cursor-pointer outline-none"
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
                <div className="space-y-1.5 shrink-0 max-h-[200px] overflow-y-auto pr-1">
                  {donutData.map((entry) => {
                    const selected = tickerFilter.toUpperCase() === entry.name;
                    return (
                      <button
                        key={entry.name}
                        type="button"
                        onClick={() => handleSliceClick(entry.name)}
                        className={`flex items-center gap-2 w-full text-left rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--color-bg-main)] ${
                          selected ? "bg-[var(--color-bg-main)]" : ""
                        }`}
                      >
                        <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                        <div className="text-xs">
                          <span className="text-[var(--color-text-secondary)] font-medium">{entry.name}</span>
                          <span className="text-[var(--color-text-muted)] ml-1.5">{formatBRL(entry.value)}</span>
                        </div>
                      </button>
                    );
                  })}
                  {donutExpanded && (
                    <button
                      type="button"
                      onClick={() => setDonutExpanded(false)}
                      className="text-xs text-[var(--color-accent)] hover:underline px-1.5 pt-1"
                    >
                      Recolher
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}
          </div>
          </div>
          </div>
          )}

          {/* Events table */}
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-[var(--color-border)]">
              <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide shrink-0">
                Eventos ({tableEvents.length})
              </h3>
              {/* Mobile-only ticker filter (desktop uses per-column filters) */}
              <input
                type="text"
                placeholder="Filtrar por ticker..."
                value={tickerFilter}
                onChange={(e) => setTickerFilter(e.target.value)}
                className="md:hidden bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-muted)] w-32 sm:w-48"
              />
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[var(--color-border)] max-h-[312px] overflow-y-auto">
              {tableEvents.map((e) => (
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
            <div className="hidden md:block overflow-x-auto max-h-[312px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--color-bg-card)] sticky top-0 z-10">
                    {([
                      { key: "payment_date", label: "Pagamento", align: "left" },
                      { key: "ex_date", label: "Ex-data", align: "left" },
                      { key: "ticker", label: "Ticker", align: "left" },
                      { key: "status", label: "Status", align: "left" },
                      { key: "gross", label: "Bruto", align: "right" },
                      { key: "tax", label: "Imposto", align: "right" },
                      { key: "net", label: "Líquido", align: "right" },
                    ] as const).map((col) => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className={`px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)] cursor-pointer select-none hover:text-[var(--color-text-primary)] ${
                          col.align === "right" ? "text-right" : "text-left"
                        }`}
                      >
                        <span className={`inline-flex items-center gap-1 ${col.align === "right" ? "flex-row-reverse" : ""}`}>
                          {col.label}
                          <span className="text-[10px] w-2">
                            {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                          </span>
                        </span>
                      </th>
                    ))}
                  </tr>
                  {/* Per-column filter row */}
                  <tr className="bg-[var(--color-bg-card)] sticky top-[37px] z-10">
                    <th className="px-2 py-1.5">
                      <input
                        type="text"
                        placeholder="dd/mm/aaaa"
                        value={paymentFilter}
                        onChange={(e) => setPaymentFilter(e.target.value)}
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-2 py-1 text-xs font-normal text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-muted)]"
                      />
                    </th>
                    <th className="px-2 py-1.5">
                      <input
                        type="text"
                        placeholder="dd/mm/aaaa"
                        value={exDateFilter}
                        onChange={(e) => setExDateFilter(e.target.value)}
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-2 py-1 text-xs font-normal text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-muted)]"
                      />
                    </th>
                    <th className="px-2 py-1.5">
                      <input
                        type="text"
                        placeholder="Ticker..."
                        value={tickerFilter}
                        onChange={(e) => setTickerFilter(e.target.value)}
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-2 py-1 text-xs font-normal text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-muted)]"
                      />
                    </th>
                    <th className="px-2 py-1.5">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-2 py-1 text-xs font-normal text-[var(--color-text-secondary)]"
                      >
                        <option value="">Todos</option>
                        {statusOptions.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </th>
                    <th className="px-2 py-1.5">
                      <input
                        type="number"
                        placeholder="≥ mín"
                        value={grossMin}
                        onChange={(e) => setGrossMin(e.target.value)}
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-2 py-1 text-xs font-normal text-right text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-muted)]"
                      />
                    </th>
                    <th className="px-2 py-1.5">
                      <input
                        type="number"
                        placeholder="≥ mín"
                        value={taxMin}
                        onChange={(e) => setTaxMin(e.target.value)}
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-2 py-1 text-xs font-normal text-right text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-muted)]"
                      />
                    </th>
                    <th className="px-2 py-1.5">
                      <input
                        type="number"
                        placeholder="≥ mín"
                        value={netMin}
                        onChange={(e) => setNetMin(e.target.value)}
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-2 py-1 text-xs font-normal text-right text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-muted)]"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableEvents.map((e) => (
                    <tr key={e.id} className="border-t border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50">
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                        {new Date(e.payment_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                        {e.ex_date ? new Date(e.ex_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{e.ticker || "—"}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{e.status}</td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {formatBRL(Number(e.gross_amount ?? e.credited_amount))}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[var(--color-text-muted)]">
                        {formatBRL(Number(e.withholding_tax ?? 0))}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-[var(--color-positive)]">
                        {formatBRL(Number(e.credited_amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {tableEvents.length === 0 && (
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
