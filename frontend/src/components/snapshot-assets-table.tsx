"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { SnapshotAssetItem } from "@/types";
import MobileCard from "@/components/mobile-card";

const TYPE_LABELS: Record<string, string> = {
  STOCK: "Stock",
  ACAO: "Acao",
  FII: "FII",
  RF: "RF",
};

const TYPE_COLORS: Record<string, string> = {
  STOCK: "bg-blue-500/20 text-blue-400",
  ACAO: "bg-emerald-500/20 text-emerald-400",
  FII: "bg-amber-500/20 text-amber-400",
  RF: "bg-violet-500/20 text-violet-400",
};

export default function SnapshotAssetsTable({ month }: { month: string }) {
  const [data, setData] = useState<SnapshotAssetItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<SnapshotAssetItem[]>(`/snapshots/assets?month=${month}`)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [month]);

  if (loading) {
    return (
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4 tracking-tight">
          Fechamento por Ativo
        </h3>
        <div className="h-32 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4 tracking-tight">
          Fechamento por Ativo
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] text-center py-6">
          Sem dados para este mes. Gere os snapshots primeiro.
        </p>
      </div>
    );
  }

  const pnlColor = (val: number | null) => {
    const v = val ?? 0;
    return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-[var(--color-text-secondary)]";
  };

  return (
    <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 md:p-6 shadow-sm min-h-0 flex flex-col h-full">
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4 tracking-tight shrink-0">
        Fechamento por Ativo
      </h3>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2 flex-1 overflow-y-auto">
        {data.map((row) => (
          <MobileCard
            key={row.ticker}
            header={
              <>
                <span className="font-medium text-sm text-[var(--color-text-primary)]">
                  {row.ticker}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[row.type] || ""}`}>
                  {TYPE_LABELS[row.type] || row.type}
                </span>
              </>
            }
            badge={
              <span className={`text-sm font-semibold ${pnlColor(row.pnl_pct)}`}>
                {row.pnl_pct != null ? `${row.pnl_pct >= 0 ? "+" : ""}${row.pnl_pct.toFixed(2)}%` : "\u2014"}
              </span>
            }
            bodyItems={[
              { label: "Valor", value: row.market_value != null ? formatBRL(row.market_value) : "\u2014" },
              { label: "Qtd", value: row.type === "RF" ? "\u2014" : row.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) },
            ]}
            expandedItems={[
              { label: "Preco Medio", value: formatBRL(row.avg_price) },
              { label: "Fechamento", value: row.closing_price != null ? formatBRL(row.closing_price) : "\u2014" },
              {
                label: "PnL (R$)",
                value: (
                  <span className={pnlColor(row.pnl)}>
                    {row.pnl != null ? formatBRL(row.pnl) : "\u2014"}
                  </span>
                ),
              },
            ]}
          />
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Ativo
              </th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Tipo
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Qtd
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Preco Medio
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Fechamento
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Valor
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                PnL
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                PnL %
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const pnl = row.pnl ?? 0;
              const color = pnlColor(pnl);

              return (
                <tr
                  key={row.ticker}
                  className="border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-bg-main)]/50 transition-colors"
                >
                  <td className="py-2.5 px-3 font-medium text-[var(--color-text-primary)]">
                    {row.ticker}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[row.type] || ""}`}>
                      {TYPE_LABELS[row.type] || row.type}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-[var(--color-text-secondary)] tabular-nums">
                    {row.type === "RF" ? "\u2014" : row.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[var(--color-text-secondary)] tabular-nums">
                    {formatBRL(row.avg_price)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[var(--color-text-secondary)] tabular-nums">
                    {row.closing_price != null ? formatBRL(row.closing_price) : "\u2014"}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[var(--color-text-secondary)] tabular-nums">
                    {row.market_value != null ? formatBRL(row.market_value) : "\u2014"}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${color}`}>
                    {row.pnl != null ? formatBRL(row.pnl) : "\u2014"}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${color}`}>
                    {row.pnl_pct != null
                      ? `${row.pnl_pct >= 0 ? "+" : ""}${row.pnl_pct.toFixed(2)}%`
                      : "\u2014"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
