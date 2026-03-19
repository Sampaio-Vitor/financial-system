"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { FixedIncomePosition } from "@/types";
import { formatBRL, formatPercent } from "@/lib/format";

export default function RendaFixaPage() {
  const [positions, setPositions] = useState<FixedIncomePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{
    applied_value: string;
    current_balance: string;
  }>({ applied_value: "", current_balance: "" });
  const [saving, setSaving] = useState(false);
  const [resgateId, setResgateId] = useState<number | null>(null);
  const [resgateAmount, setResgateAmount] = useState("");
  const [resgateSubmitting, setResgateSubmitting] = useState(false);

  const fetchPositions = useCallback(async () => {
    try {
      const data = await apiFetch<FixedIncomePosition[]>("/fixed-income");
      setPositions(data);
    } catch {
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const startEdit = (p: FixedIncomePosition) => {
    setEditingId(p.id);
    setEditData({
      applied_value: String(Number(p.applied_value)),
      current_balance: String(Number(p.current_balance)),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      await apiFetch(`/fixed-income/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          applied_value: parseFloat(editData.applied_value),
          current_balance: parseFloat(editData.current_balance),
        }),
      });
      setEditingId(null);
      fetchPositions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const resgatePosition = positions.find((p) => p.id === resgateId);

  const handleResgate = async () => {
    if (!resgateId || !resgateAmount) return;
    const amount = parseFloat(resgateAmount.replace(/\./g, "").replace(",", "."));
    if (isNaN(amount) || amount <= 0) return;

    if (resgatePosition && amount >= Number(resgatePosition.current_balance)) {
      if (!confirm("Valor igual ou superior ao saldo atual. Isso ira remover a posicao. Continuar?")) return;
    }

    setResgateSubmitting(true);
    try {
      await apiFetch(`/fixed-income/${resgateId}/resgate`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      setResgateId(null);
      setResgateAmount("");
      fetchPositions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao resgatar");
    } finally {
      setResgateSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-6">Renda Fixa</h1>
        <div className="animate-pulse h-64 rounded-xl bg-[var(--color-bg-card)]" />
      </div>
    );
  }

  const totalApplied = positions.reduce((s, p) => s + Number(p.applied_value), 0);
  const totalBalance = positions.reduce((s, p) => s + Number(p.current_balance), 0);
  const totalYield = positions.reduce((s, p) => s + Number(p.yield_value), 0);

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
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Data Aplicacao</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Valor Aplicado</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Saldo Atual</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Rendimento</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Rend. (%)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Vencimento</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-muted)]">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const isEditing = editingId === p.id;
                  const editApplied = parseFloat(editData.applied_value) || 0;
                  const editBalance = parseFloat(editData.current_balance) || 0;
                  const editYield = editBalance - editApplied;
                  const editYieldPct = editApplied > 0 ? (editYield / editApplied) * 100 : 0;

                  return (
                    <tr key={p.id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50">
                      <td className="px-3 py-2.5 font-medium">{p.ticker}</td>
                      <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{p.description}</td>
                      <td className="px-3 py-2.5 text-[var(--color-text-muted)]">
                        {new Date(p.start_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      {isEditing ? (
                        <>
                          <td className="px-3 py-1.5">
                            <input
                              type="number"
                              step="any"
                              value={editData.applied_value}
                              onChange={(e) => setEditData({ ...editData, applied_value: e.target.value })}
                              className="w-28 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="number"
                              step="any"
                              value={editData.current_balance}
                              onChange={(e) => setEditData({ ...editData, current_balance: e.target.value })}
                              className="w-28 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm"
                            />
                          </td>
                          <td className={`px-3 py-2.5 ${editYield >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}>
                            {formatBRL(editYield)}
                          </td>
                          <td className={`px-3 py-2.5 ${editYieldPct >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}>
                            {formatPercent(editYieldPct)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5">{formatBRL(p.applied_value)}</td>
                          <td className="px-3 py-2.5">{formatBRL(p.current_balance)}</td>
                          <td className="px-3 py-2.5 text-[var(--color-positive)]">{formatBRL(p.yield_value)}</td>
                          <td className="px-3 py-2.5 text-[var(--color-positive)]">{formatPercent(p.yield_pct * 100)}</td>
                        </>
                      )}
                      <td className="px-3 py-2.5 text-[var(--color-text-muted)]">
                        {p.maturity_date
                          ? new Date(p.maturity_date + "T00:00:00").toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => saveEdit(p.id)}
                              disabled={saving}
                              className="text-xs text-[var(--color-positive)] hover:underline disabled:opacity-50"
                            >
                              {saving ? "..." : "Salvar"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-xs text-[var(--color-text-muted)] hover:underline"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setResgateId(p.id); setResgateAmount(""); }}
                              className="text-xs text-[var(--color-negative)] hover:underline"
                            >
                              Resgatar
                            </button>
                            <button
                              onClick={() => startEdit(p)}
                              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                              title="Editar"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                <path d="m15 5 4 4"/>
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] font-bold">
                  <td className="px-3 py-2.5" colSpan={3}>TOTAL</td>
                  <td className="px-3 py-2.5">{formatBRL(totalApplied)}</td>
                  <td className="px-3 py-2.5">{formatBRL(totalBalance)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-positive)]">{formatBRL(totalYield)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-positive)]">
                    {formatPercent(totalApplied > 0 ? (totalYield / totalApplied) * 100 : 0)}
                  </td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {/* Resgate modal */}
      {resgateId !== null && resgatePosition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-1">Resgatar</h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              {resgatePosition.ticker} — Saldo atual: {formatBRL(resgatePosition.current_balance)}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                  Valor do Resgate (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={resgateAmount}
                  onChange={(e) => setResgateAmount(e.target.value)}
                  placeholder="0,00"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleResgate}
                  disabled={resgateSubmitting || !resgateAmount}
                  className="flex-1 py-2 rounded-lg bg-[var(--color-negative)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {resgateSubmitting ? "Resgatando..." : "Confirmar Resgate"}
                </button>
                <button
                  onClick={() => setResgateId(null)}
                  className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-main)] transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
