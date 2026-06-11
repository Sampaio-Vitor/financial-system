"use client";

import { Fragment, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { formatBRL, formatCurrency, formatQuantity } from "@/lib/format";
import { AssetYieldItem, CurrencyCode, DividendYieldResponse, Market, PositionItem } from "@/types";
import { apiFetch } from "@/lib/api";
import TickerLogo from "@/components/ticker-logo";
import MobileCard from "@/components/mobile-card";
import AssetDetailCharts from "@/components/asset-detail-charts";

interface PositionsTableProps {
  positions: PositionItem[];
  totalCost: number;
  totalMarketValue: number;
  totalPnl: number;
  totalPnlPct: number | null;
  metadataMode?: "none" | "market_currency";
  showUsdRate?: boolean;
  usdBrlRate?: number;
  /** "focus" hides P&L and current price from default view; "full" shows everything */
  mode?: "focus" | "full";
  /** Currency in which monetary values are displayed. Defaults to BRL. */
  displayCurrency?: CurrencyCode;
  onRefresh?: () => void;
}

type SortKey = keyof PositionItem | "yield_pct";

const SORT_OPTIONS_FOCUS: { label: string; key: SortKey }[] = [
  { label: "Ticker", key: "ticker" },
  { label: "Valor na Carteira", key: "market_value" },
  { label: "Qtd", key: "quantity" },
  { label: "Custo Total", key: "total_cost" },
  { label: "Yield 12m", key: "yield_pct" },
  { label: "Primeira Compra", key: "first_date" },
];

const SORT_OPTIONS_FULL: { label: string; key: SortKey }[] = [
  { label: "Ticker", key: "ticker" },
  { label: "Valor Mercado", key: "market_value" },
  { label: "P&L (%)", key: "pnl_pct" },
  { label: "P&L (R$)", key: "pnl" },
  { label: "Yield 12m", key: "yield_pct" },
  { label: "Qtd", key: "quantity" },
];

const MARKET_LABELS: Record<Market, string> = {
  BR: "Brasil",
  US: "EUA",
  EU: "Europa",
  UK: "Reino Unido",
  CRYPTO: "Cripto",
};

const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  BRL: "BRL",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PositionsTable({
  positions,
  totalCost,
  totalMarketValue,
  metadataMode = "none",
  mode = "focus",
  displayCurrency = "BRL",
  onRefresh,
}: PositionsTableProps) {
  const sortOptions = mode === "focus" ? SORT_OPTIONS_FOCUS : SORT_OPTIONS_FULL;
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [yields, setYields] = useState<Record<number, AssetYieldItem>>({});
  const [ignoredAnomalyPurchaseIds, setIgnoredAnomalyPurchaseIds] = useState<Set<number>>(
    () => new Set()
  );

  useEffect(() => {
    apiFetch<DividendYieldResponse>("/dividends/yield")
      .then((data) => {
        const map: Record<number, AssetYieldItem> = {};
        for (const item of data.assets) map[item.asset_id] = item;
        setYields(map);
      })
      .catch(() => setYields({}));
  }, []);

  const yieldOf = (p: PositionItem) => yields[p.asset_id]?.yield_pct ?? null;
  const yieldLabel = (p: PositionItem) => {
    const y = yields[p.asset_id];
    if (!y || y.yield_pct == null) return "—";
    return `${Number(y.yield_pct).toFixed(2).replace(".", ",")}%${y.is_annualized ? "*" : ""}`;
  };

  const isNative = displayCurrency !== "BRL";
  const fmt = (value: number | null | undefined) =>
    formatCurrency(value, displayCurrency);
  const marketValueOf = (p: PositionItem) =>
    isNative ? p.market_value_native ?? null : p.market_value;
  const totalCostOf = (p: PositionItem) =>
    isNative ? p.total_cost_native ?? null : p.total_cost;
  const visibleAnomalies = (p: PositionItem) =>
    (p.price_anomalies ?? []).filter(
      (anomaly) => !ignoredAnomalyPurchaseIds.has(anomaly.purchase_id)
    );

  const ignoreAnomaly = async (purchaseId: number) => {
    await apiFetch(`/purchases/${purchaseId}/price-anomaly-ignore`, {
      method: "POST",
    });
    setIgnoredAnomalyPurchaseIds((current) => {
      const next = new Set(current);
      next.add(purchaseId);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = [...positions].sort((a, b) => {
    const av = sortKey === "yield_pct" ? yieldOf(a) : a[sortKey];
    const bv = sortKey === "yield_pct" ? yieldOf(b) : b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const an = typeof av === "string" ? Number(av) : av;
    const bn = typeof bv === "string" ? Number(bv) : bv;
    const bothNumeric =
      typeof an === "number" && typeof bn === "number" && !Number.isNaN(an) && !Number.isNaN(bn);
    const cmp = bothNumeric
      ? an - bn
      : av < bv ? -1 : av > bv ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  // Weighted yield of the positions shown, considering only assets that have
  // dividend data — positions too young to have paid anything yet are left out
  // of the denominator instead of being counted as 0%.
  const groupYieldLabel = (() => {
    let annualized = 0;
    let market = 0;
    for (const p of positions) {
      const y = yields[p.asset_id];
      if (!y) continue;
      annualized += Number(y.dividends_annualized);
      if (p.market_value != null) market += Number(p.market_value);
    }
    if (!market || !annualized) return "—";
    return `${((annualized / market) * 100).toFixed(2).replace(".", ",")}%`;
  })();

  const colHeader = (label: string, key: SortKey) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text-secondary)] select-none"
      onClick={() => handleSort(key)}
    >
      {label} {sortKey === key ? (sortAsc ? "\u2191" : "\u2193") : ""}
    </th>
  );

  const metadataLabel = (position: PositionItem) => {
    if (metadataMode === "none") {
      return null;
    }
    if (!position.asset_class || !position.market || !position.quote_currency) {
      return null;
    }
    return `${MARKET_LABELS[position.market]} • ${CURRENCY_LABELS[position.quote_currency]}`;
  };

  const badgeLabel = (position: PositionItem) => {
    // In focus mode, show market/currency or asset type instead of P&L
    if (position.market && position.quote_currency) {
      return `${position.market} • ${position.quote_currency}`;
    }
    if (position.asset_class) {
      return position.asset_class;
    }
    return position.type;
  };

  const anomalyNotice = (position: PositionItem) => {
    const anomalies = visibleAnomalies(position);
    if (anomalies.length === 0) return null;
    const currency = position.quote_currency ?? displayCurrency;
    return (
      <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3">
        <div className="flex items-start gap-2 text-xs text-red-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div className="space-y-2">
            {anomalies.map((anomaly) => (
              <div key={anomaly.purchase_id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  Aporte em {formatDate(anomaly.purchase_date)} registrado a{" "}
                  {formatCurrency(anomaly.unit_price_native, currency)}, fora da faixa do dia{" "}
                  {formatCurrency(anomaly.low_native, currency)} -{" "}
                  {formatCurrency(anomaly.high_native, currency)}.
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    ignoreAnomaly(anomaly.purchase_id).catch(() => undefined);
                  }}
                  className="rounded border border-red-400/40 px-2 py-0.5 text-[11px] font-medium text-red-200 hover:bg-red-500/20"
                >
                  Ignorar
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile card view */}
      <div className="space-y-3 md:hidden">
        {/* Sort control */}
        <div className="sticky top-[3.5rem] z-20 -mx-3 flex items-center gap-2 border-y border-[var(--color-border)] bg-[var(--color-bg-main)]/95 px-3 py-2 backdrop-blur">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">Ordenar</span>
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey);
              setSortAsc(true);
            }}
            className="min-h-9 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1.5 text-xs text-[var(--color-text-secondary)]"
          >
            {sortOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="min-h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)]"
          >
            {sortAsc ? "\u2191" : "\u2193"}
          </button>
        </div>

        {sorted.map((p) => {
          const anomalies = visibleAnomalies(p);
          return (
          <div key={p.asset_id}>
            <MobileCard
              header={
                <>
                  <TickerLogo
                    ticker={p.ticker}
                    type={p.type}
                    assetClass={p.asset_class}
                    market={p.market}
                    size={22}
                  />
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">
                      {p.ticker}
                    </span>
                    {anomalies.length > 0 && (
                      <span className="ml-1 inline-flex align-middle text-red-400" title="Possivel erro no preco de aporte">
                        <AlertTriangle size={13} />
                      </span>
                    )}
                    {metadataLabel(p) && (
                      <div className="truncate text-[10px] text-[var(--color-text-muted)]">
                        {metadataLabel(p)}
                      </div>
                    )}
                  </div>
                </>
              }
              badge={
                <span className="rounded-md bg-[var(--color-bg-main)] px-2 py-1 text-[10px] font-semibold text-[var(--color-text-muted)]">
                  {badgeLabel(p)}
                </span>
              }
              bodyItems={[
                { label: "Valor na Carteira", value: fmt(marketValueOf(p)) },
                { label: "Quantidade", value: formatQuantity(p.quantity) },
                { label: "Yield 12m", value: yieldLabel(p) },
              ]}
              expandedItems={[
                { label: "Custo Total", value: fmt(totalCostOf(p)) },
                { label: "Primeira Compra", value: formatDate(p.first_date) },
                ...(p.quote_currency && p.quote_currency !== "BRL"
                  ? [{ label: "Moeda / FX", value: `${CURRENCY_LABELS[p.quote_currency]} • ${formatBRL(p.fx_rate_to_brl)}` }]
                  : []),
              ]}
              actions={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedId(expandedId === p.asset_id ? null : p.asset_id);
                  }}
                  className="min-h-9 rounded-lg border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-text-muted)] transition-colors active:bg-[var(--color-bg-main)]"
                >
                  Gráficos
                </button>
              }
            />
            {expandedId === p.asset_id && (
              <div className="mt-2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
                {anomalyNotice(p)}
                <AssetDetailCharts
                  ticker={p.ticker}
                  assetId={p.asset_id}
                  currentPrice={p.current_price}
                  currentPriceNative={p.current_price_native}
                  displayCurrency={displayCurrency}
                  onPriceHistoryLoaded={onRefresh}
                />
              </div>
            )}
          </div>
          );
        })}

        {/* Totals card */}
        <div className="mt-3 rounded-xl border border-[var(--color-accent)]/35 bg-[var(--color-bg-card)] p-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-[var(--color-text-primary)]">TOTAL</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
            <div className="min-w-0">
              <span className="block text-[11px] text-[var(--color-text-muted)]">Valor na Carteira</span>
              <div className="truncate text-sm font-medium text-[var(--color-text-secondary)]">
                {fmt(totalMarketValue)}
              </div>
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] text-[var(--color-text-muted)]">Custo Total</span>
              <div className="truncate text-sm font-medium text-[var(--color-text-secondary)]">
                {fmt(totalCost)}
              </div>
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] text-[var(--color-text-muted)]">Yield 12m</span>
              <div className="truncate text-sm font-medium text-[var(--color-text-secondary)]">
                {groupYieldLabel}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: totals header + scrollable table */}
      <div className="hidden md:block bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-sm">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[13%]" />
            <col className="w-[19%]" />
            <col className="w-[18%]" />
            <col className="w-[11%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {colHeader("Ativo", "ticker")}
              {colHeader("Quantidade", "quantity")}
              {colHeader("Valor na Carteira", "market_value")}
              {colHeader("Custo Total", "total_cost")}
              {colHeader("Yield 12m", "yield_pct")}
              {colHeader("Primeira Compra", "first_date")}
            </tr>
            <tr className="border-b-2 border-[var(--color-border)] font-bold text-sm">
              <td className="px-3 py-2">TOTAL</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2">{fmt(totalMarketValue)}</td>
              <td className="px-3 py-2">{fmt(totalCost)}</td>
              <td className="px-3 py-2">{groupYieldLabel}</td>
              <td className="px-3 py-2"></td>
            </tr>
          </thead>
        </table>
        <div className="overflow-x-auto max-h-[792px] overflow-y-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[13%]" />
            <col className="w-[19%]" />
            <col className="w-[18%]" />
            <col className="w-[11%]" />
            <col className="w-[15%]" />
          </colgroup>
          <tbody>
            {sorted.map((p) => {
              const isExpanded = expandedId === p.asset_id;
              return (
                <Fragment key={p.asset_id}>
                  <tr
                    className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : p.asset_id)}
                  >
                    <td className="px-3 py-2.5 font-medium">
                      <div className="flex items-center gap-2">
                        <TickerLogo
                          ticker={p.ticker}
                          type={p.type}
                          assetClass={p.asset_class}
                          market={p.market}
                          size={22}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span>{p.ticker}</span>
                            {visibleAnomalies(p).length > 0 && (
                              <span className="inline-flex text-red-400" title="Possivel erro no preco de aporte">
                                <AlertTriangle size={14} />
                              </span>
                            )}
                          </div>
                          {metadataLabel(p) && (
                            <div className="text-[10px] font-normal text-[var(--color-text-muted)]">
                              {metadataLabel(p)}
                            </div>
                          )}
                        </div>
                        <ChevronDown
                          size={14}
                          className={`text-[var(--color-text-muted)] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{formatQuantity(p.quantity)}</td>
                    <td className="px-3 py-2.5">{fmt(marketValueOf(p))}</td>
                    <td className="px-3 py-2.5">{fmt(totalCostOf(p))}</td>
                    <td
                      className="px-3 py-2.5"
                      title={
                        yields[p.asset_id]?.is_annualized
                          ? "Posição com menos de 12 meses — proventos anualizados"
                          : undefined
                      }
                    >
                      {yieldLabel(p)}
                    </td>
                    <td className="px-3 py-2.5">{formatDate(p.first_date)}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-[var(--color-border)]/50">
                      <td colSpan={6} className="p-0 bg-[var(--color-bg-main)]/40">
                        <div className="border-b border-[var(--color-border)]/50 px-4 py-3 text-xs text-[var(--color-text-muted)]">
                          <span className="mr-4">
                            Mercado: {p.market ? MARKET_LABELS[p.market] : "—"}
                          </span>
                          <span className="mr-4">
                            Moeda: {p.quote_currency ? CURRENCY_LABELS[p.quote_currency] : "—"}
                          </span>
                          <span>
                            FX BRL:{" "}
                            {p.quote_currency && p.quote_currency !== "BRL"
                              ? formatBRL(p.fx_rate_to_brl)
                              : formatBRL(1)}
                          </span>
                        </div>
                        {anomalyNotice(p)}
                        <AssetDetailCharts
                          ticker={p.ticker}
                          assetId={p.asset_id}
                          currentPrice={p.current_price}
                          currentPriceNative={p.current_price_native}
                          displayCurrency={displayCurrency}
                          onPriceHistoryLoaded={onRefresh}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}
