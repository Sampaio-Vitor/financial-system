"use client";

import { useState } from "react";
import { formatBRL, formatPercent, formatQuantity } from "@/lib/format";
import { PositionItem } from "@/types";

interface PositionsTableProps {
  positions: PositionItem[];
  totalCost: number;
  totalMarketValue: number;
  totalPnl: number;
  totalPnlPct: number | null;
  showUsdRate?: boolean;
  usdBrlRate?: number;
}

type SortKey = keyof PositionItem;

export default function PositionsTable({
  positions,
  totalCost,
  totalMarketValue,
  totalPnl,
  totalPnlPct,
}: PositionsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortAsc, setSortAsc] = useState(true);

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
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  const colHeader = (label: string, key: SortKey) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text-secondary)] select-none"
      onClick={() => handleSort(key)}
    >
      {label} {sortKey === key ? (sortAsc ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="overflow-x-auto bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-main)]/30">
            {colHeader("Ticker", "ticker")}
            <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
              Descricao
            </th>
            {colHeader("1o Aporte", "first_date")}
            {colHeader("Qtd", "quantity")}
            {colHeader("Preco Medio", "avg_price")}
            {colHeader("Cotacao Atual", "current_price")}
            {colHeader("Valor Mercado", "market_value")}
            {colHeader("P&L (R$)", "pnl")}
            {colHeader("P&L (%)", "pnl_pct")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr
              key={p.asset_id}
              className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50"
            >
              <td className="px-3 py-2.5 font-medium">{p.ticker}</td>
              <td className="px-3 py-2.5 text-[var(--color-text-secondary)] max-w-[200px] truncate">
                {p.description}
              </td>
              <td className="px-3 py-2.5 text-[var(--color-text-muted)]">
                {p.first_date
                  ? new Date(p.first_date + "T00:00:00").toLocaleDateString("pt-BR")
                  : "—"}
              </td>
              <td className="px-3 py-2.5">{formatQuantity(p.quantity)}</td>
              <td className="px-3 py-2.5">{formatBRL(p.avg_price)}</td>
              <td className="px-3 py-2.5">{formatBRL(p.current_price)}</td>
              <td className="px-3 py-2.5">{formatBRL(p.market_value)}</td>
              <td
                className={`px-3 py-2.5 font-medium ${
                  (p.pnl ?? 0) >= 0
                    ? "text-[var(--color-positive)]"
                    : "text-[var(--color-negative)]"
                }`}
              >
                {formatBRL(p.pnl)}
              </td>
              <td
                className={`px-3 py-2.5 font-medium ${
                  (p.pnl_pct ?? 0) >= 0
                    ? "text-[var(--color-positive)]"
                    : "text-[var(--color-negative)]"
                }`}
              >
                {formatPercent(p.pnl_pct)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--color-border)] font-bold">
            <td className="px-3 py-2.5" colSpan={6}>
              TOTAL
            </td>
            <td className="px-3 py-2.5">{formatBRL(totalMarketValue)}</td>
            <td
              className={`px-3 py-2.5 ${
                totalPnl >= 0
                  ? "text-[var(--color-positive)]"
                  : "text-[var(--color-negative)]"
              }`}
            >
              {formatBRL(totalPnl)}
            </td>
            <td
              className={`px-3 py-2.5 ${
                (totalPnlPct ?? 0) >= 0
                  ? "text-[var(--color-positive)]"
                  : "text-[var(--color-negative)]"
              }`}
            >
              {formatPercent(totalPnlPct)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
