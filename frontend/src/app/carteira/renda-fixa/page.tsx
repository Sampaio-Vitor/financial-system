"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { FixedIncomePosition } from "@/types";
import { formatBRL, formatPercent } from "@/lib/format";

export default function RendaFixaPage() {
  const [positions, setPositions] = useState<FixedIncomePosition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<FixedIncomePosition[]>("/fixed-income")
      .then(setPositions)
      .catch(() => setPositions([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-6">Renda Fixa</h1>
        <div className="animate-pulse h-64 rounded-xl bg-[var(--color-bg-card)]" />
      </div>
    );
  }

  const totalApplied = positions.reduce((s, p) => s + p.applied_value, 0);
  const totalBalance = positions.reduce((s, p) => s + p.current_balance, 0);
  const totalYield = positions.reduce((s, p) => s + p.yield_value, 0);

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Renda Fixa</h1>

      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
        {positions.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-center py-8">
            Nenhuma posicao em Renda Fixa.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Tipo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Descricao</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Valor Aplicado</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Saldo Atual</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Rendimento</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Rend. (%)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Vencimento</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50">
                    <td className="px-3 py-2.5 font-medium">{p.ticker}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{p.description}</td>
                    <td className="px-3 py-2.5">{formatBRL(p.applied_value)}</td>
                    <td className="px-3 py-2.5">{formatBRL(p.current_balance)}</td>
                    <td className="px-3 py-2.5 text-[var(--color-positive)]">{formatBRL(p.yield_value)}</td>
                    <td className="px-3 py-2.5 text-[var(--color-positive)]">{formatPercent(p.yield_pct * 100)}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text-muted)]">
                      {p.maturity_date
                        ? new Date(p.maturity_date + "T00:00:00").toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] font-bold">
                  <td className="px-3 py-2.5" colSpan={2}>TOTAL</td>
                  <td className="px-3 py-2.5">{formatBRL(totalApplied)}</td>
                  <td className="px-3 py-2.5">{formatBRL(totalBalance)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-positive)]">{formatBRL(totalYield)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-positive)]">
                    {formatPercent(totalApplied > 0 ? (totalYield / totalApplied) * 100 : 0)}
                  </td>
                  <td className="px-3 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
