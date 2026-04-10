"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-modal";
import { Trash2, Pencil } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { formatBRL, getCurrentMonth } from "@/lib/format";
import { FinancialReserveEntry, FinancialReserveMonthValue, FinancialReserveTarget } from "@/types";
import MonthNavigator from "@/components/month-navigator";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReservaPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [month, setMonth] = useState(getCurrentMonth());
  const [monthData, setMonthData] = useState<FinancialReserveMonthValue | null>(null);
  const [history, setHistory] = useState<FinancialReserveEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [resgateAmount, setResgateAmount] = useState("");
  const [resgateDate, setResgateDate] = useState(todayStr());
  const [savingResgate, setSavingResgate] = useState(false);
  const [targetData, setTargetData] = useState<FinancialReserveTarget | null>(null);
  const [editTarget, setEditTarget] = useState("");
  const [savingTarget, setSavingTarget] = useState(false);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(parsed) || parsed < 0) return;

    setSaving(true);
    try {
      const current = Number(monthData?.amount ?? 0);
      const newAmount = current + parsed;
      await apiFetch("/financial-reserves", {
        method: "POST",
        body: JSON.stringify({
          amount: newAmount,
          note: note || null,
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
      await fetchData();
    } catch {
      // ignore
    } finally {
      setSavingTarget(false);
    }
  };

  const handleResgate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(resgateAmount.replace(/\./g, "").replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) return;

    const current = monthData?.amount ?? 0;
    if (parsed > current) {
      toast.error("Valor de resgate excede o saldo atual da reserva.");
      return;
    }

    setSavingResgate(true);
    try {
      const newAmount = current - parsed;
      await apiFetch("/financial-reserves", {
        method: "POST",
        body: JSON.stringify({
          amount: newAmount,
          note: `Resgate de R$ ${parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          recorded_at: resgateDate ? `${resgateDate}T00:00:00` : null,
        }),
      });
      setResgateAmount("");
      setResgateDate(todayStr());
      await fetchData();
    } catch {
      // ignore
    } finally {
      setSavingResgate(false);
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

  const currentValue = monthData?.amount;
  const targetAmount = targetData?.target_amount;
  const progressPct =
    currentValue != null && targetAmount
      ? Math.min((currentValue / targetAmount) * 100, 100)
      : 0;

  // Derive min month from oldest history entry (history is sorted desc)
  const minMonth = history.length > 0
    ? new Date(history[history.length - 1].recorded_at).toISOString().slice(0, 7)
    : null;

  // Chart data: last entry per month, sorted chronologically
  const chartData = useMemo(() => {
    if (history.length === 0) return [];
    const byMonth = new Map<string, number>();
    // history is sorted desc, so iterate in reverse to keep last entry per month
    for (let i = history.length - 1; i >= 0; i--) {
      const e = history[i];
      const m = new Date(e.recorded_at).toISOString().slice(0, 7);
      byMonth.set(m, parseFloat(e.amount.toString()));
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, value]) => ({
        month: m.slice(5) + "/" + m.slice(0, 4), // "MM/YYYY"
        value,
      }));
  }, [history]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-xl font-bold">Reserva Financeira</h1>
          <MonthNavigator month={month} onChange={setMonth} minMonth={minMonth} />
        </div>
        <div className="animate-pulse h-64 rounded-xl bg-[var(--color-bg-card)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-bold">Reserva Financeira</h1>
        <MonthNavigator month={month} onChange={setMonth} />
      </div>

      {/* Unified card: Current value + progress + target setting */}
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6">
          {/* Left: value + progress */}
          <div>
            <p className="text-sm font-medium text-[var(--color-text-muted)] mb-1">
              Valor da Reserva
            </p>
            <p className="text-3xl font-extrabold tracking-tight mb-4">
              {currentValue != null ? formatBRL(currentValue) : "—"}
            </p>

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
                  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                })}
              </p>
            )}
          </div>

          {/* Right: target setting */}
          <div className="md:border-l md:border-[var(--color-border)] md:pl-6 flex flex-col justify-center">
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-3">
              Meta da Reserva
            </h2>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--color-text-muted)]">
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
              <button
                onClick={handleSaveTarget}
                disabled={savingTarget || !editTarget}
                className="w-full px-5 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {savingTarget ? "Salvando..." : "Definir Meta"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Evolution chart */}
      {chartData.length >= 2 && (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6">
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-4">
            Evolucao da Reserva
          </h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
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
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#06b6d4" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Forms side by side: Registrar Novo Valor + Registrar Resgate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Register new value */}
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 flex flex-col">
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-4">
            Registrar Novo Valor
          </h2>
          <form onSubmit={handleSave} className="flex flex-col flex-1 gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
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
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                  Data
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                Nota (opcional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: Deposito, Rendimentos..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !amount}
              className="w-full mt-auto px-5 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </form>
        </div>

        {/* Resgate form */}
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 flex flex-col">
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-4">
            Registrar Resgate
          </h2>
          <form onSubmit={handleResgate} className="flex flex-col flex-1 gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                  Valor a resgatar (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={resgateAmount}
                  onChange={(e) => setResgateAmount(e.target.value)}
                  placeholder="5.000,00"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-negative)]/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                  Data
                </label>
                <input
                  type="date"
                  value={resgateDate}
                  onChange={(e) => setResgateDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-negative)]/50"
                />
              </div>
            </div>
            {currentValue != null && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Saldo atual: {formatBRL(currentValue)}
              </p>
            )}
            <button
              type="submit"
              disabled={savingResgate || !resgateAmount}
              className="w-full mt-auto px-5 py-2 rounded-lg bg-[var(--color-negative)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {savingResgate ? "Resgatando..." : "Resgatar"}
            </button>
          </form>
        </div>
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
          <>
          {/* Mobile card view */}
          <div className="md:hidden space-y-2 px-2">
            {history.map((entry, idx) => {
              const prevEntry = idx < history.length - 1 ? history[idx + 1] : null;
              const currentAmt = Number(entry.amount);
              const prevAmt = prevEntry ? Number(prevEntry.amount) : 0;
              const diff = currentAmt - prevAmt;
              const isResgate = diff < 0;

              return (
                <div key={entry.id} className="bg-[var(--color-bg-main)] rounded-xl border border-[var(--color-border)] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isResgate ? "bg-[var(--color-negative)]/15 text-[var(--color-negative)]" : "bg-[var(--color-positive)]/15 text-[var(--color-positive)]"}`}>
                        {isResgate ? "RESGATE" : "APORTE"}
                      </span>
                      <span className={`text-sm font-medium ${isResgate ? "text-[var(--color-negative)]" : "text-[var(--color-positive)]"}`}>
                        {isResgate ? "- " : "+ "}{formatBRL(Math.abs(diff))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(entry)} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(entry.id)} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-red-500"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {new Date(entry.recorded_at).toLocaleDateString("pt-BR")}
                    {entry.note && <span className="ml-2">{entry.note}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile bottom-sheet edit modal */}
          {editingId !== null && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:hidden">
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

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Data
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Operacao
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Valor
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Nota
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-muted)]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, idx) => {
                  // history is sorted desc; previous chronological entry is idx+1
                  const prevEntry = idx < history.length - 1 ? history[idx + 1] : null;
                  const currentAmt = Number(entry.amount);
                  const prevAmt = prevEntry ? Number(prevEntry.amount) : 0;
                  const diff = currentAmt - prevAmt;
                  const isResgate = diff < 0;

                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50"
                    >
                      {editingId === entry.id ? (
                        <>
                          <td className="px-3 py-2.5">
                            <input
                              type="date"
                              value={editData.recorded_at}
                              onChange={(e) => setEditData({ ...editData, recorded_at: e.target.value })}
                              className="w-36 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm"
                            />
                          </td>
                          <td className="px-3 py-2.5" />
                          <td className="px-3 py-2.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editData.amount}
                              onChange={(e) => setEditData({ ...editData, amount: e.target.value })}
                              className="w-32 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="text"
                              value={editData.note}
                              onChange={(e) => setEditData({ ...editData, note: e.target.value })}
                              className="w-full px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => saveEdit(entry.id)}
                                disabled={savingEdit}
                                className="text-xs text-[var(--color-positive)] hover:underline disabled:opacity-50"
                              >
                                {savingEdit ? "..." : "Salvar"}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-xs text-[var(--color-text-muted)] hover:underline"
                              >
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5">
                            {new Date(entry.recorded_at).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              isResgate
                                ? "bg-[var(--color-negative)]/15 text-[var(--color-negative)]"
                                : "bg-[var(--color-positive)]/15 text-[var(--color-positive)]"
                            }`}>
                              {isResgate ? "RESGATE" : "APORTE"}
                            </span>
                          </td>
                          <td className={`px-3 py-2.5 font-medium ${isResgate ? "text-[var(--color-negative)]" : "text-[var(--color-positive)]"}`}>
                            {isResgate ? "- " : "+ "}{formatBRL(Math.abs(diff))}
                          </td>
                          <td className="px-3 py-2.5 text-[var(--color-text-muted)]">
                            {entry.note || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => startEdit(entry)}
                                className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors"
                                title="Editar"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(entry.id)}
                                className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
