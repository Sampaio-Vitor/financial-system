"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { FixedIncomePosition, FixedIncomeInterest } from "@/types";
import { formatBRL, getCurrentMonth } from "@/lib/format";
import MonthNavigator from "@/components/month-navigator";

interface JurosModalProps {
  open: boolean;
  positions: FixedIncomePosition[];
  interest: FixedIncomeInterest[];
  onClose: () => void;
  onSaved: () => void;
}

function getPreviousBalance(
  positionId: number,
  month: string,
  interest: FixedIncomeInterest[],
  appliedValue: number,
): number {
  // Find the most recent interest entry for this position before the selected month
  // reference_month is stored as "YYYY-MM-DD" (last day of month), month is "YYYY-MM"
  let best: FixedIncomeInterest | null = null;
  for (const entry of interest) {
    if (entry.fixed_income_id !== positionId) continue;
    const entryMonth = entry.reference_month.slice(0, 7);
    if (entryMonth >= month) continue;
    if (!best || entryMonth > best.reference_month.slice(0, 7)) {
      best = entry;
    }
  }
  return best ? Number(best.new_balance) : appliedValue;
}

function hasEntryForMonth(
  positionId: number,
  month: string,
  interest: FixedIncomeInterest[],
): boolean {
  return interest.some(
    (e) => e.fixed_income_id === positionId && e.reference_month.startsWith(month),
  );
}

export default function JurosModal({ open, positions, interest, onClose, onSaved }: JurosModalProps) {
  const [month, setMonth] = useState(() => getCurrentMonth());
  const [balances, setBalances] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    const currentMonth = getCurrentMonth();
    for (const entry of interest) {
      if (entry.fixed_income_id && entry.reference_month.startsWith(currentMonth)) {
        initial[entry.fixed_income_id] = String(Number(entry.new_balance));
      }
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth);
    const newBalances: Record<number, string> = {};
    for (const entry of interest) {
      if (entry.fixed_income_id && entry.reference_month.startsWith(newMonth)) {
        newBalances[entry.fixed_income_id] = String(Number(entry.new_balance));
      }
    }
    setBalances(newBalances);
  };

  const handleSubmit = async () => {
    const entries = Object.entries(balances)
      .filter(([, val]) => val !== "")
      .map(([id, val]) => ({
        fixed_income_id: Number(id),
        new_balance: parseFloat(val),
      }))
      .filter((e) => !isNaN(e.new_balance));

    if (entries.length === 0) return;

    setSubmitting(true);
    try {
      await apiFetch("/fixed-income/interest", {
        method: "POST",
        body: JSON.stringify({ reference_month: month, entries }),
      });
      onClose();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar juros");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-3xl">
        <h2 className="text-lg font-bold mb-4">Registrar Juros</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--color-text-secondary)]">Mes de Referencia</span>
            <MonthNavigator month={month} onChange={handleMonthChange} />
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-bg-card)]">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Tipo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Descricao</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-muted)]">Saldo Anterior</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-muted)]">Novo Saldo</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-muted)]">Juros</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const prevBalance = getPreviousBalance(p.id, month, interest, p.applied_value);
                  const newBalStr = balances[p.id] || "";
                  const newBalNum = parseFloat(newBalStr);
                  const juros = !isNaN(newBalNum) ? newBalNum - prevBalance : null;
                  const existing = hasEntryForMonth(p.id, month, interest);

                  return (
                    <tr key={p.id} className="border-b border-[var(--color-border)]/50">
                      <td className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {p.ticker}
                          {existing && (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-amber-500"
                              title="Registro existente para este mes"
                            />
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-secondary)]">{p.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatBRL(prevBalance)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          type="number"
                          step="any"
                          value={balances[p.id] || ""}
                          onChange={(e) =>
                            setBalances((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder={String(Number(prevBalance))}
                          className="w-32 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {juros !== null ? (
                          <span
                            style={{
                              color: juros >= 0
                                ? "var(--color-positive)"
                                : "var(--color-negative)",
                            }}
                          >
                            {formatBRL(juros)}
                          </span>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting || Object.values(balances).every((v) => v === "")}
              className="flex-1 py-2 rounded-lg bg-amber-600 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Registrando..." : "Confirmar Juros"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-main)] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
