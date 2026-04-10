"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Trash2, Pencil, ArrowUpCircle, ArrowDownCircle, Check, X } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { formatBRL, getCurrentMonth } from "@/lib/format";
import { FinancialReserveEntry, FinancialReserveMonthValue, FinancialReserveTarget } from "@/types";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

type FormMode = "aporte" | "resgate";

export default function ReservaPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [month] = useState(getCurrentMonth());
  const [monthData, setMonthData] = useState<FinancialReserveMonthValue | null>(null);
  const [history, setHistory] = useState<FinancialReserveEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [formMode, setFormMode] = useState<FormMode>("aporte");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);

  const [targetData, setTargetData] = useState<FinancialReserveTarget | null>(null);
  const [editTarget, setEditTarget] = useState("");
  const [savingTarget, setSavingTarget] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{
    recorded_at: string;
    amount: string;
    note: string;
  }>({ recorded_at: "", amount: "", note: "" });
  const [savingEdit, setSavingEdit] = useState(false);

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
        setEditTarget(parseFloat(target.target_amount.toString()).toString());
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) return;

    const current = Number(monthData?.amount ?? 0);

    if (formMode === "resgate" && parsed > current) {
      toast.error("Valor de resgate excede o saldo atual da reserva.");
      return;
    }

    setSaving(true);
    try {
      const newAmount = formMode === "aporte" ? current + parsed : current - parsed;
      const noteText = formMode === "resgate"
        ? `Resgate de R$ ${parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        : note || null;

      await apiFetch("/financial-reserves", {
        method: "POST",
        body: JSON.stringify({
          amount: newAmount,
          note: noteText,
          recorded_at: date ? `${date}T00:00:00` : null,
        }),
      });
      setAmount("");
      setNote("");
      setDate(todayStr());
      await fetchData();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm("Excluir Registro", "Excluir este registro?");
    if (!ok) return;
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
      setEditingTarget(false);
      await fetchData();
    } catch {
      // ignore
    } finally {
      setSavingTarget(false);
    }
  };

  const startEdit = (entry: FinancialReserveEntry) => {
    setEditingId(entry.id);
    const num = parseFloat(entry.amount.toString());
    setEditData({
      recorded_at: new Date(entry.recorded_at).toISOString().slice(0, 10),
      amount: num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      note: entry.note || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: number) => {
    const parsed = parseFloat(editData.amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(parsed) || parsed < 0) return;

    setSavingEdit(true);
    try {
      await apiFetch(`/financial-reserves/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          amount: parsed,
          note: editData.note || null,
          recorded_at: `${editData.recorded_at}T00:00:00`,
        }),
      });
      setEditingId(null);
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSavingEdit(false);
    }
  };

  const currentValue = monthData?.amount ?? 0;
  const targetAmount = targetData?.target_amount;
  const progressPct =
    currentValue != null && targetAmount
      ? Math.min((currentValue / targetAmount) * 100, 100)
      : 0;
  const remaining = targetAmount ? Math.max(targetAmount - currentValue, 0) : 0;

  // Chart data: last entry per month, sorted chronologically
  const chartData = useMemo(() => {
    if (history.length === 0) return [];
    const byMonth = new Map<string, number>();
    for (let i = history.length - 1; i >= 0; i--) {
      const e = history[i];
      const m = new Date(e.recorded_at).toISOString().slice(0, 7);
      byMonth.set(m, parseFloat(e.amount.toString()));
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, value]) => {
        const [y, mo] = m.split("-");
        const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        return {
          month: `${monthNames[parseInt(mo) - 1]}/${y.slice(2)}`,
          value,
        };
      });
  }, [history]);

  // Compute history entries with diffs
  const historyWithDiffs = useMemo(() => {
    return history.map((entry, idx) => {
      const prevEntry = idx < history.length - 1 ? history[idx + 1] : null;
      const currentAmt = Number(entry.amount);
      const prevAmt = prevEntry ? Number(prevEntry.amount) : 0;
      const diff = currentAmt - prevAmt;
      return { entry, diff, isResgate: diff < 0 };
    });
  }, [history]);


  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Reserva Financeira</h1>
        <div className="animate-pulse h-64 rounded-xl bg-[var(--color-bg-card)]" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <ConfirmDialog />

      {/* Top stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
        {/* Current value */}
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Saldo Atual</p>
          <p className="text-2xl font-extrabold tracking-tight">{formatBRL(currentValue)}</p>
        </div>

        {/* Target / progress */}
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Meta</p>
            {!editingTarget && (
              <button onClick={() => setEditingTarget(true)} className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors">
                <Pencil size={12} />
              </button>
            )}
          </div>
          {editingTarget ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="decimal"
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                placeholder="50000"
                className="w-full px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-page)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveTarget(); if (e.key === "Escape") setEditingTarget(false); }}
                autoFocus
              />
              <button onClick={handleSaveTarget} disabled={savingTarget} className="text-[var(--color-positive)] hover:opacity-80 shrink-0"><Check size={16} /></button>
              <button onClick={() => setEditingTarget(false)} className="text-[var(--color-text-muted)] hover:opacity-80 shrink-0"><X size={16} /></button>
            </div>
          ) : targetAmount ? (
            <>
              <p className="text-lg font-extrabold tracking-tight">{formatBRL(targetAmount)}</p>
              <div className="w-full h-1.5 rounded-full bg-[var(--color-bg-main)] mt-1.5">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: progressPct >= 100 ? "var(--color-positive)" : "#06b6d4",
                  }}
                />
              </div>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                {progressPct.toFixed(0)}% atingido &middot; faltam {formatBRL(remaining)}
              </p>
            </>
          ) : (
            <button onClick={() => setEditingTarget(true)} className="text-sm text-[var(--color-accent)] hover:underline mt-1">
              Definir meta
            </button>
          )}
        </div>
      </div>

      {/* Main content: chart left, form + history right */}
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4 min-h-0 flex-1">

        {/* Left: Chart */}
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4 flex flex-col min-h-0">
          <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Evolucao da Reserva
          </h2>
          {chartData.length >= 2 ? (
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="reservaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={{ stroke: "#2a2d3a" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e2130",
                      border: "1px solid #2a2d3a",
                      borderRadius: "8px",
                      color: "#f8fafc",
                      fontSize: "12px",
                    }}
                    formatter={(v: number) => [formatBRL(v), "Reserva"]}
                  />
                  {targetAmount && (
                    <ReferenceLine
                      y={targetAmount}
                      stroke="#06b6d4"
                      strokeDasharray="6 4"
                      strokeOpacity={0.5}
                      label={{ value: `Meta: ${formatBRL(targetAmount)}`, position: "insideTopLeft", fill: "#64748b", fontSize: 11 }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fill="url(#reservaGradient)"
                    dot={{ r: 3, fill: "#06b6d4", strokeWidth: 0 }}
                    activeDot={{ r: 5, stroke: "#06b6d4", strokeWidth: 2, fill: "#1e2130" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-muted)]">
              Dados insuficientes para o grafico
            </div>
          )}
        </div>

        {/* Right: Form + History */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Unified form */}
          <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4 shrink-0">
            {/* Mode toggle */}
            <div className="flex rounded-lg bg-[var(--color-bg-main)] p-0.5 mb-3">
              <button
                onClick={() => setFormMode("aporte")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  formMode === "aporte"
                    ? "bg-[var(--color-positive)]/15 text-[var(--color-positive)] shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                <ArrowUpCircle size={14} />
                Aporte
              </button>
              <button
                onClick={() => setFormMode("resgate")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  formMode === "resgate"
                    ? "bg-[var(--color-negative)]/15 text-[var(--color-negative)] shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                <ArrowDownCircle size={14} />
                Resgate
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">Valor (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={formMode === "aporte" ? "1.000,00" : "500,00"}
                    required
                    className={`w-full px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] text-sm focus:outline-none focus:ring-2 ${
                      formMode === "aporte" ? "focus:ring-[var(--color-positive)]/30" : "focus:ring-[var(--color-negative)]/30"
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">Data</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                  />
                </div>
              </div>
              <div className={formMode === "resgate" ? "invisible" : ""}>
                <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-0.5">Nota (opcional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Deposito, Rendimentos..."
                  disabled={formMode === "resgate"}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                />
              </div>
              <button
                type="submit"
                disabled={saving || !amount}
                className={`w-full px-4 py-2 rounded-lg text-white text-sm font-semibold transition-opacity disabled:opacity-40 ${
                  formMode === "aporte"
                    ? "bg-[var(--color-positive)] hover:opacity-90"
                    : "bg-[var(--color-negative)] hover:opacity-90"
                }`}
              >
                {saving ? "Salvando..." : formMode === "aporte" ? "Registrar Aporte" : "Registrar Resgate"}
              </button>
            </form>
          </div>

          {/* History — scrollable */}
          <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4 flex flex-col">
            <h2 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2 shrink-0">
              Historico
            </h2>
            {history.length === 0 ? (
              <p className="text-[var(--color-text-muted)] text-center py-6 text-sm">
                Nenhum registro encontrado.
              </p>
            ) : (
              <div className="overflow-y-auto max-h-[340px] -mx-1 px-1 space-y-1.5">
                {historyWithDiffs.map(({ entry, diff, isResgate }) => (
                  <div key={entry.id} className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--color-bg-main)] transition-colors">
                    {editingId === entry.id ? (
                      <div className="flex-1 space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="date"
                            value={editData.recorded_at}
                            onChange={(e) => setEditData({ ...editData, recorded_at: e.target.value })}
                            className="px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-page)] text-xs"
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editData.amount}
                            onChange={(e) => setEditData({ ...editData, amount: e.target.value })}
                            className="px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-page)] text-xs"
                          />
                        </div>
                        <input
                          type="text"
                          value={editData.note}
                          onChange={(e) => setEditData({ ...editData, note: e.target.value })}
                          placeholder="Nota"
                          className="w-full px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-page)] text-xs"
                        />
                        <div className="flex gap-1.5">
                          <button onClick={() => saveEdit(entry.id)} disabled={savingEdit} className="text-[10px] font-medium text-[var(--color-positive)] hover:underline disabled:opacity-50">
                            {savingEdit ? "..." : "Salvar"}
                          </button>
                          <button onClick={cancelEdit} className="text-[10px] font-medium text-[var(--color-text-muted)] hover:underline">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Icon */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          isResgate ? "bg-[var(--color-negative)]/10" : "bg-[var(--color-positive)]/10"
                        }`}>
                          {isResgate
                            ? <ArrowDownCircle size={14} className="text-[var(--color-negative)]" />
                            : <ArrowUpCircle size={14} className="text-[var(--color-positive)]" />
                          }
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-semibold ${isResgate ? "text-[var(--color-negative)]" : "text-[var(--color-positive)]"}`}>
                              {isResgate ? "- " : "+ "}{formatBRL(Math.abs(diff))}
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--color-text-muted)] truncate">
                            {new Date(entry.recorded_at).toLocaleDateString("pt-BR")}
                            {entry.note && <span className="ml-1.5">&middot; {entry.note}</span>}
                          </p>
                        </div>

                        {/* Actions — show on hover */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => startEdit(entry)}
                            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="p-1 rounded text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile bottom-sheet edit modal */}
      {editingId !== null && (
        <div className="fixed inset-0 z-50 flex items-end md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={cancelEdit} />
          <div className="relative w-full bg-[var(--color-bg-card)] rounded-t-2xl border-t border-[var(--color-border)] p-6 space-y-4">
            <h3 className="text-base font-bold">Editar Registro</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Data</label>
                <input type="date" value={editData.recorded_at} onChange={(e) => setEditData({ ...editData, recorded_at: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Valor (R$)</label>
                <input type="text" inputMode="decimal" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Nota</label>
                <input type="text" value={editData.note} onChange={(e) => setEditData({ ...editData, note: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={cancelEdit} className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm font-medium">Cancelar</button>
              <button onClick={() => saveEdit(editingId)} disabled={savingEdit} className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50">{savingEdit ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
