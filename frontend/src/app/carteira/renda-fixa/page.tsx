"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import AporteModal from "@/components/renda-fixa/aporte-modal";
import ResgateModal from "@/components/renda-fixa/resgate-modal";
import JurosModal from "@/components/renda-fixa/juros-modal";
import {
  Asset,
  FixedIncomePosition,
  FixedIncomeRedemption,
  FixedIncomeInterest,
  MonthlyOverview,
} from "@/types";
import { formatBRL, formatPercent } from "@/lib/format";

interface TimelineEvent {
  id: string;
  date: string;
  type: "APORTE" | "RESGATE" | "JUROS";
  ticker: string;
  description: string;
  amount: number;
}

export default function RendaFixaPage() {
  const [positions, setPositions] = useState<FixedIncomePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{
    applied_value: string;
    current_balance: string;
  }>({ applied_value: "", current_balance: "" });
  const [saving, setSaving] = useState(false);
  const [redemptions, setRedemptions] = useState<FixedIncomeRedemption[]>([]);
  const [interest, setInterest] = useState<FixedIncomeInterest[]>([]);
  const [rfAssets, setRfAssets] = useState<Asset[]>([]);

  // Modal toggles
  const [aporteOpen, setAporteOpen] = useState(false);
  const [resgateOpen, setResgateOpen] = useState(false);
  const [jurosOpen, setJurosOpen] = useState(false);

  // Confirm modal for timeline deletions
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: "", message: "" });
  const pendingConfirm = useRef<((value: boolean) => void) | null>(null);

  // Target for chart
  const [rfTargetValue, setRfTargetValue] = useState<number | null>(null);

  const fetchPositions = useCallback(async () => {
    try {
      const [posData, redData, intData] = await Promise.all([
        apiFetch<FixedIncomePosition[]>("/fixed-income"),
        apiFetch<FixedIncomeRedemption[]>("/fixed-income/redemptions"),
        apiFetch<FixedIncomeInterest[]>("/fixed-income/interest"),
      ]);
      setPositions(posData);
      setRedemptions(redData);
      setInterest(intData);
    } catch {
      setPositions([]);
      setRedemptions([]);
      setInterest([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  useEffect(() => {
    apiFetch<Asset[]>("/assets")
      .then((all) => setRfAssets(all.filter((a) => a.type === "RF")))
      .catch(() => {});

    const month = new Date().toISOString().slice(0, 7);
    apiFetch<MonthlyOverview>(`/portfolio/overview?month=${month}`)
      .then((overview) => {
        const breakdown = overview.allocation_breakdown;
        const rfClass = breakdown.find((c) => c.asset_class === "RF");
        if (rfClass && Number(rfClass.target_pct) > 0) {
          const patrimonioInvestivel = breakdown.reduce((s, c) => s + Number(c.value), 0);
          setRfTargetValue((Number(rfClass.target_pct) / 100) * patrimonioInvestivel);
        }
      })
      .catch(() => {});
  }, []);

  const startEdit = (p: FixedIncomePosition) => {
    setEditingId(p.id);
    setEditData({
      applied_value: String(Number(p.applied_value)),
      current_balance: String(Number(p.current_balance)),
    });
  };

  const cancelEdit = () => setEditingId(null);

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
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const mostRecentInterestByPosition = useMemo(() => {
    const map = new Map<number, number>();
    for (const entry of interest) {
      if (entry.fixed_income_id && !map.has(entry.fixed_income_id)) {
        map.set(entry.fixed_income_id, entry.id);
      }
    }
    return map;
  }, [interest]);

  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];
    for (const p of positions) {
      events.push({ id: `aporte-${p.id}`, date: p.start_date, type: "APORTE", ticker: p.ticker || "", description: p.description, amount: Number(p.applied_value) });
    }
    for (const r of redemptions) {
      events.push({ id: `resgate-${r.id}`, date: r.redemption_date, type: "RESGATE", ticker: r.ticker, description: r.description, amount: Number(r.amount) });
    }
    for (const i of interest) {
      events.push({ id: `juros-${i.id}`, date: i.reference_month, type: "JUROS", ticker: i.ticker, description: i.description, amount: Number(i.interest_amount) });
    }
    events.sort((a, b) => b.date.localeCompare(a.date));
    return events;
  }, [positions, redemptions, interest]);

  const chartData = useMemo(() => {
    const capitalEvents = timeline.filter((e) => e.type !== "JUROS");
    if (capitalEvents.length === 0) return [];
    const byMonth = new Map<string, number>();
    for (const e of capitalEvents) {
      const m = e.date.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) || 0) + (e.type === "APORTE" ? e.amount : -e.amount));
    }
    const months = Array.from(byMonth.keys()).sort();
    let cumulative = 0;
    return months.map((m) => {
      cumulative += byMonth.get(m)!;
      return { month: m.slice(5) + "/" + m.slice(2, 4), value: cumulative };
    });
  }, [timeline]);

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Renda Fixa</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setAporteOpen(true)}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Registrar Aporte
          </button>
          {positions.length > 0 && (
            <>
              <button
                onClick={() => setJurosOpen(true)}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Registrar Juros
              </button>
              <button
                onClick={() => setResgateOpen(true)}
                className="px-4 py-2 rounded-lg bg-[var(--color-negative)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Resgatar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Positions table */}
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
        {positions.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-center py-8">Nenhuma posicao em Renda Fixa.</p>
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
                            <input type="number" step="any" value={editData.applied_value} onChange={(e) => setEditData({ ...editData, applied_value: e.target.value })} className="w-28 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" step="any" value={editData.current_balance} onChange={(e) => setEditData({ ...editData, current_balance: e.target.value })} className="w-28 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                          </td>
                          <td className={`px-3 py-2.5 ${editYield >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}>{formatBRL(editYield)}</td>
                          <td className={`px-3 py-2.5 ${editYieldPct >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}>{formatPercent(editYieldPct)}</td>
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
                        {p.maturity_date ? new Date(p.maturity_date + "T00:00:00").toLocaleDateString("pt-BR") : "\u2014"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => saveEdit(p.id)} disabled={saving} className="text-xs text-[var(--color-positive)] hover:underline disabled:opacity-50">{saving ? "..." : "Salvar"}</button>
                            <button onClick={cancelEdit} className="text-xs text-[var(--color-text-muted)] hover:underline">Cancelar</button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(p)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors" title="Editar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>
                            </svg>
                          </button>
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
                  <td className="px-3 py-2.5 text-[var(--color-positive)]">{formatPercent(totalApplied > 0 ? (totalYield / totalApplied) * 100 : 0)}</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Timeline + Chart side by side */}
      {timeline.length > 0 && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-3 px-2">Aportes, Resgates & Juros</h2>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--color-bg-card)]">
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Data</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Operacao</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Descricao</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Valor</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-muted)]" />
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((e) => {
                    const badgeClass = e.type === "RESGATE" ? "bg-[var(--color-negative)]/15 text-[var(--color-negative)]" : e.type === "JUROS" ? "bg-amber-500/15 text-amber-500" : "bg-[var(--color-positive)]/15 text-[var(--color-positive)]";
                    const valueClass = e.type === "RESGATE" ? "text-[var(--color-negative)]" : e.type === "JUROS" ? (e.amount >= 0 ? "text-amber-500" : "text-[var(--color-negative)]") : "text-[var(--color-positive)]";
                    const prefix = e.type === "RESGATE" ? "- " : e.amount >= 0 ? "+ " : "";
                    const canDelete = e.type === "RESGATE" || (e.type === "JUROS" && (() => {
                      const entryId = Number(e.id.replace("juros-", ""));
                      const entry = interest.find((i) => i.id === entryId);
                      if (!entry || !entry.fixed_income_id) return entry != null;
                      return mostRecentInterestByPosition.get(entry.fixed_income_id) === entryId;
                    })());

                    return (
                      <tr key={e.id} className="border-b border-[var(--color-border)]/50">
                        <td className="px-3 py-2.5 whitespace-nowrap">{new Date(e.date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                        <td className="px-3 py-2.5"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badgeClass}`}>{e.type}</span></td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)]"><span className="font-medium">{e.ticker}</span> {e.description}</td>
                        <td className={`px-3 py-2.5 font-medium whitespace-nowrap ${valueClass}`}>{prefix}{formatBRL(Math.abs(e.amount))}</td>
                        <td className="px-3 py-2.5 text-right">
                          {canDelete && (
                            <button
                              onClick={async () => {
                                const label = e.type === "RESGATE" ? "resgate" : "juros";
                                const ok = await new Promise<boolean>((resolve) => {
                                  pendingConfirm.current = resolve;
                                  setConfirmState({ open: true, title: "Confirmar Remocao", message: `Remover este ${label} do historico?` });
                                });
                                if (!ok) return;
                                const entryId = e.id.replace(/^(resgate|juros)-/, "");
                                const endpoint = e.type === "RESGATE" ? `/fixed-income/redemptions/${entryId}` : `/fixed-income/interest/${entryId}`;
                                try {
                                  await apiFetch(endpoint, { method: "DELETE" });
                                  fetchPositions();
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Erro ao remover");
                                }
                              }}
                              className="text-[var(--color-text-muted)] hover:text-[var(--color-negative)] transition-colors"
                              title="Remover"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-3 px-2">Evolucao Mensal</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#2a2d3a" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <Tooltip contentStyle={{ backgroundColor: "#1e2130", border: "1px solid #2a2d3a", borderRadius: "8px", color: "#f8fafc", fontSize: "12px" }} formatter={(v: number) => [formatBRL(v), "Capital Investido"]} />
                  {rfTargetValue != null && (
                    <ReferenceLine y={rfTargetValue} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth={2} label={{ value: `Meta: ${formatBRL(rfTargetValue)}`, position: "insideTopRight", fill: "#f59e0b", fontSize: 11 }} />
                  )}
                  <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4, fill: "#8b5cf6" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={() => { pendingConfirm.current?.(true); setConfirmState((s) => ({ ...s, open: false })); }}
        onCancel={() => { pendingConfirm.current?.(false); setConfirmState((s) => ({ ...s, open: false })); }}
      />
      <AporteModal open={aporteOpen} rfAssets={rfAssets} onClose={() => setAporteOpen(false)} onSaved={fetchPositions} />
      <ResgateModal open={resgateOpen} positions={positions} onClose={() => setResgateOpen(false)} onSaved={fetchPositions} />
      <JurosModal open={jurosOpen} positions={positions} interest={interest} onClose={() => setJurosOpen(false)} onSaved={fetchPositions} />
    </div>
  );
}
