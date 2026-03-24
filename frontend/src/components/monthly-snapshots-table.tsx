"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { formatBRL, getMonthLabel } from "@/lib/format";
import { PatrimonioEvolutionPoint } from "@/types";
import MobileCard from "@/components/mobile-card";

export default function MonthlySnapshotsTable() {
  const [data, setData] = useState<PatrimonioEvolutionPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<PatrimonioEvolutionPoint[]>(
        "/snapshots/evolution"
      );
      setData(result);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-6 tracking-tight">
          Fechamento Mensal
        </h3>
        <div className="h-32 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return null;
  }

  const sorted = [...data].reverse();

  const pnlColor = (val: number) =>
    val > 0 ? "text-emerald-400" : val < 0 ? "text-red-400" : "text-[var(--color-text-secondary)]";

  return (
    <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 md:p-6 shadow-sm">
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4 tracking-tight">
        Fechamento Mensal
      </h3>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {sorted.map((row) => {
          const pnl = Number(row.total_pnl);
          const pnlPct = Number(row.pnl_pct);

          return (
            <MobileCard
              key={row.month}
              header={
                <span className="font-medium text-sm text-[var(--color-text-primary)]">
                  {getMonthLabel(row.month)}
                </span>
              }
              badge={
                <span className={`text-sm font-semibold ${pnlColor(pnl)}`}>
                  {pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                </span>
              }
              bodyItems={[
                { label: "Patrimonio", value: formatBRL(Number(row.total_patrimonio)) },
                { label: "Investido", value: formatBRL(Number(row.total_invested)) },
              ]}
              expandedItems={[
                {
                  label: "PnL (R$)",
                  value: (
                    <span className={pnlColor(pnl)}>{formatBRL(pnl)}</span>
                  ),
                },
              ]}
            />
          );
        })}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Mes
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Patrimonio
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Investido
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
            {sorted.map((row) => {
              const pnl = Number(row.total_pnl);
              const pnlPct = Number(row.pnl_pct);
              const color = pnlColor(pnl);

              return (
                <tr
                  key={row.month}
                  className="border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-bg-main)]/50 transition-colors"
                >
                  <td className="py-2.5 px-3 font-medium text-[var(--color-text-primary)]">
                    {getMonthLabel(row.month)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[var(--color-text-secondary)] tabular-nums">
                    {formatBRL(Number(row.total_patrimonio))}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[var(--color-text-secondary)] tabular-nums">
                    {formatBRL(Number(row.total_invested))}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${color}`}>
                    {formatBRL(pnl)}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${color}`}>
                    {pnl >= 0 ? "+" : ""}
                    {pnlPct.toFixed(2)}%
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
