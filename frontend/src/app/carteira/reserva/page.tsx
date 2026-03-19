"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatBRL, getCurrentMonth } from "@/lib/format";
import { FinancialReserveEntry, FinancialReserveMonthValue, FinancialReserveTarget } from "@/types";
import MonthNavigator from "@/components/month-navigator";

export default function ReservaPage() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [monthData, setMonthData] = useState<FinancialReserveMonthValue | null>(null);
  const [history, setHistory] = useState<FinancialReserveEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [targetData, setTargetData] = useState<FinancialReserveTarget | null>(null);
  const [editTarget, setEditTarget] = useState("");
  const [savingTarget, setSavingTarget] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [monthVal, hist, target] = await Promise.all([
        apiFetch<FinancialReserveMonthValue>(`/financial-reserves?month=${month}`),
        apiFetch<FinancialReserveEntry[]>("/financial-reserves/history"),
        apiFetch<FinancialReserveTarget>("/financial-reserves/target"),
      ]);
      setMonthData(monthVal);
      setHistory(hist);
      setTargetData(target);
      if (target.target_amount != null) {
        setEditTarget(target.target_amount.toString());
      }
    } catch {
      setMonthData(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(parsed) || parsed < 0) return;

    setSaving(true);
    try {
      await apiFetch("/financial-reserves", {
        method: "POST",
        body: JSON.stringify({ amount: parsed, note: note || null }),
      });
      setAmount("");
      setNote("");
      await fetchData();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir este registro?")) return;
    try {
      await apiFetch(`/financial-reserves/${id}`, { method: "DELETE" });
      await fetchData();
    } catch {
      // ignore
    }
  };

  const handleSaveTarget = async () => {
    const parsed = parseFloat(editTarget.replace(/\./g, "").replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) return;

    setSavingTarget(true);
    try {
      await apiFetch("/financial-reserves/target", {
        method: "PUT",
        body: JSON.stringify({ target_amount: parsed }),
      });
      await fetchData();
    } catch {
      // ignore
    } finally {
      setSavingTarget(false);
    }
  };

  const currentValue = monthData?.amount;
  const targetAmount = targetData?.target_amount;
  const progressPct =
    currentValue != null && targetAmount
      ? Math.min((currentValue / targetAmount) * 100, 100)
      : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Reserva Financeira</h1>
          <MonthNavigator month={month} onChange={setMonth} />
        </div>
        <div className="animate-pulse h-64 rounded-xl bg-[var(--color-bg-card)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Reserva Financeira</h1>
        <MonthNavigator month={month} onChange={setMonth} />
      </div>

      {/* Current value + progress card */}
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-muted)] mb-1">
              Valor da Reserva
            </p>
            <p className="text-3xl font-extrabold tracking-tight">
              {currentValue != null ? formatBRL(currentValue) : "—"}
            </p>
          </div>
          {targetAmount != null && (
            <div className="text-right">
              <p className="text-sm font-medium text-[var(--color-text-muted)] mb-1">
                Meta
              </p>
              <p className="text-xl font-bold text-[var(--color-text-secondary)]">
                {formatBRL(targetAmount)}
              </p>
            </div>
          )}
        </div>

        {targetAmount != null && (
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-1">
              <span>{progressPct.toFixed(1)}% da meta</span>
              <span>
                {currentValue != null ? formatBRL(currentValue) : "R$ 0"} / {formatBRL(targetAmount)}
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-[var(--color-bg-main)]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: progressPct >= 100 ? "var(--color-positive)" : "#06b6d4",
                }}
              />
            </div>
          </div>
        )}

        {monthData?.entry && (
          <p className="text-xs text-[var(--color-text-muted)] mt-2">
            Atualizado em{" "}
            {new Date(monthData.entry.recorded_at).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      {/* Target setting */}
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-4">
          Meta da Reserva
        </h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Valor alvo (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={editTarget}
              onChange={(e) => setEditTarget(e.target.value)}
              placeholder="50000"
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
            />
          </div>
          <button
            onClick={handleSaveTarget}
            disabled={savingTarget || !editTarget}
            className="px-5 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {savingTarget ? "Salvando..." : "Definir Meta"}
          </button>
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-4">
          Registrar Novo Valor
        </h2>
        <form onSubmit={handleSave} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Valor (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="37.778,67"
              required
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Nota (opcional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Deposito, Resgate..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !amount}
            className="px-5 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </form>
      </div>

      {/* History table */}
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-4 px-2">
          Historico
        </h2>
        {history.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-center py-8 text-sm">
            Nenhum registro encontrado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Data
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Valor
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Nota
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-muted)]">
                    Acoes
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50"
                  >
                    <td className="px-3 py-2.5">
                      {new Date(entry.recorded_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2.5 font-medium">
                      {formatBRL(entry.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                      {entry.note || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
