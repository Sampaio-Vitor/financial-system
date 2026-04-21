"use client";

import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatBRL, formatCurrency, formatPercent, formatQuantity } from "@/lib/format";
import { CurrencyCode, Market, PositionItem } from "@/types";
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
}

type SortKey = keyof PositionItem;

const SORT_OPTIONS: { label: string; key: SortKey }[] = [
  { label: "Ticker", key: "ticker" },
  { label: "Valor Mercado", key: "market_value" },
  { label: "P&L (%)", key: "pnl_pct" },
  { label: "P&L (R$)", key: "pnl" },
  { label: "Qtd", key: "quantity" },
];

const MARKET_LABELS: Record<Market, string> = {
  BR: "Brasil",
  US: "EUA",
  EU: "Europa",
  UK: "Reino Unido",
};

const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  BRL: "BRL",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
};

export default function PositionsTable({
  positions,
  totalCost,
  totalMarketValue,
  totalPnl,
  totalPnlPct,
  metadataMode = "none",
}: PositionsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = [...positions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
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

  const colHeader = (label: string, key: SortKey) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text-secondary)] select-none"
      onClick={() => handleSort(key)}
    >
      {label} {sortKey === key ? (sortAsc ? "\u2191" : "\u2193") : ""}
    </th>
  );

  const pnlColor = (val: number | null) =>
    (val ?? 0) >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]";

  const metadataLabel = (position: PositionItem) => {
    if (metadataMode === "none") {
      return null;
    }
    if (!position.asset_class || !position.market || !position.quote_currency) {
      return null;
    }
    return `${MARKET_LABELS[position.market]} • ${CURRENCY_LABELS[position.quote_currency]}`;
  };

  const currentPriceLabel = (position: PositionItem) => {
    const nativeCurrency = position.quote_currency ?? "BRL";
    if (
      position.current_price_native != null &&
      position.quote_currency &&
      position.quote_currency !== "BRL"
    ) {
      return `${formatCurrency(position.current_price_native, nativeCurrency)} (${formatBRL(position.current_price)})`;
    }
    return formatBRL(position.current_price);
  };

  return (
    <>
      {/* Mobile card view */}
      <div className="md:hidden space-y-2 max-h-[792px] overflow-y-auto">
        {/* Sort control */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-[var(--color-text-muted)]">Ordenar:</span>
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey);
              setSortAsc(true);
            }}
            className="text-xs bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[var(--color-text-secondary)]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="text-xs px-2 py-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)]"
          >
            {sortAsc ? "\u2191" : "\u2193"}
          </button>
        </div>

        {sorted.map((p) => (
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
                    <span className="font-medium text-sm text-[var(--color-text-primary)]">
                      {p.ticker}
                    </span>
                    {metadataLabel(p) && (
                      <div className="text-[10px] text-[var(--color-text-muted)]">
                        {metadataLabel(p)}
                      </div>
                    )}
                  </div>
                </>
              }
              badge={
                <span className={`text-sm font-semibold ${pnlColor(p.pnl_pct)}`}>
                  {formatPercent(p.pnl_pct)}
                </span>
              }
              bodyItems={[
                { label: "Valor Mercado", value: formatBRL(p.market_value) },
                { label: "Quantidade", value: formatQuantity(p.quantity) },
              ]}
              expandedItems={[
                { label: "Preço Médio", value: formatBRL(p.avg_price) },
                { label: "Cotação Atual", value: currentPriceLabel(p) },
                {
                  label: "FX para BRL",
                  value:
                    p.quote_currency && p.quote_currency !== "BRL"
                      ? formatBRL(p.fx_rate_to_brl)
                      : formatBRL(1),
                },
                {
                  label: "P&L (R$)",
                  value: (
                    <span className={pnlColor(p.pnl)}>
                      {formatBRL(p.pnl)}
                    </span>
                  ),
                },
              ]}
              actions={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedId(expandedId === p.asset_id ? null : p.asset_id);
                  }}
                  className="p-1.5 rounded-lg hover:bg-[var(--color-bg-main)] text-[var(--color-text-muted)] transition-colors text-xs"
                >
                  Graficos
                </button>
              }
            />
            {expandedId === p.asset_id && (
              <div className="mt-1 bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] overflow-hidden">
                <AssetDetailCharts
                  ticker={p.ticker}
                  assetId={p.asset_id}
                  currentPrice={p.current_price}
                />
              </div>
            )}
          </div>
        ))}

        {/* Totals card */}
        <div className="bg-[var(--color-bg-card)] rounded-xl border-2 border-[var(--color-border)] p-4 mt-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-[var(--color-text-primary)]">TOTAL</span>
            <span className={`text-sm font-semibold ${pnlColor(totalPnlPct)}`}>
              {formatPercent(totalPnlPct)}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <span className="text-xs text-[var(--color-text-muted)]">Valor Mercado</span>
              <div className="text-sm font-medium text-[var(--color-text-secondary)]">
                {formatBRL(totalMarketValue)}
              </div>
            </div>
            <div>
              <span className="text-xs text-[var(--color-text-muted)]">P&L (R$)</span>
              <div className={`text-sm font-medium ${pnlColor(totalPnl)}`}>
                {formatBRL(totalPnl)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: totals header + scrollable table */}
      <div className="hidden md:block bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-sm">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {colHeader("Ticker", "ticker")}
              {colHeader("Qtd", "quantity")}
              {colHeader("Preço Médio", "avg_price")}
              {colHeader("Cotação Atual", "current_price")}
              {colHeader("Valor Mercado", "market_value")}
              {colHeader("P&L (R$)", "pnl")}
              {colHeader("P&L (%)", "pnl_pct")}
            </tr>
            <tr className="border-b-2 border-[var(--color-border)] font-bold text-sm">
              <td className="px-3 py-2" colSpan={4}>TOTAL</td>
              <td className="px-3 py-2">{formatBRL(totalMarketValue)}</td>
              <td className={`px-3 py-2 ${pnlColor(totalPnl)}`}>{formatBRL(totalPnl)}</td>
              <td className={`px-3 py-2 ${pnlColor(totalPnlPct)}`}>{formatPercent(totalPnlPct)}</td>
            </tr>
          </thead>
        </table>
        <div className="overflow-x-auto max-h-[792px] overflow-y-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
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
                          <div>{p.ticker}</div>
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
                    <td className="px-3 py-2.5">{formatBRL(p.avg_price)}</td>
                    <td className="px-3 py-2.5">{currentPriceLabel(p)}</td>
                    <td className="px-3 py-2.5">{formatBRL(p.market_value)}</td>
                    <td className={`px-3 py-2.5 font-medium ${pnlColor(p.pnl)}`}>
                      {formatBRL(p.pnl)}
                    </td>
                    <td className={`px-3 py-2.5 font-medium ${pnlColor(p.pnl_pct)}`}>
                      {formatPercent(p.pnl_pct)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-[var(--color-border)]/50">
                      <td colSpan={7} className="p-0 bg-[var(--color-bg-main)]/40">
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
                        <AssetDetailCharts ticker={p.ticker} assetId={p.asset_id} currentPrice={p.current_price} />
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
