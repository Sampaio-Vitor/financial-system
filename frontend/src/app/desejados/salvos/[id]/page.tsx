"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { SavedPlan, ClassRebalancing, AssetType } from "@/types";
import { formatBRL, formatUSD, formatPercent } from "@/lib/format";
import { ChevronLeft, ShieldCheck, CheckCircle2, Circle } from "lucide-react";
import TickerLogo from "@/components/ticker-logo";
import Link from "next/link";

const CLASS_COLORS: Record<string, string> = {
  STOCK: "#3b82f6",
  ACAO: "#10b981",
  FII: "#f59e0b",
  RF: "#8b5cf6",
  RESERVA: "#06b6d4",
};

export default function SavedPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingChecks, setSavingChecks] = useState(false);

  const fetchPlan = useCallback(async () => {
    try {
      const data = await apiFetch<SavedPlan>(`/saved-plans/${id}`);
      setPlan(data);
    } catch {
      toast.error("Erro ao carregar plano");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const toggleCheck = async (itemId: number) => {
    if (!plan) return;
    const updated = plan.items.map((item) =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    setPlan({ ...plan, items: updated });

    setSavingChecks(true);
    try {
      const checkedIds = updated.filter((i) => i.checked).map((i) => i.id);
      await apiFetch(`/saved-plans/${id}/checks`, {
        method: "PUT",
        body: JSON.stringify({ checked_item_ids: checkedIds }),
      });
    } catch {
      toast.error("Erro ao salvar progresso");
      // revert
      setPlan((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === itemId ? { ...item, checked: !item.checked } : item
              ),
            }
          : prev
      );
    } finally {
      setSavingChecks(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-8">
        Carregando...
      </p>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-4">
        <Link
          href="/desejados/salvos"
          className="flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <ChevronLeft size={16} /> Voltar
        </Link>
        <p className="text-sm text-[var(--color-negative)]">
          Plano não encontrado.
        </p>
      </div>
    );
  }

  const classBreakdown: ClassRebalancing[] = (() => {
    try {
      return JSON.parse(plan.class_breakdown_json);
    } catch {
      return [];
    }
  })();

  const checkedCount = plan.items.filter((i) => i.checked).length;
  const totalItems = plan.items.length;
  const progress = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;

  const totalPlannedBrl = plan.items.reduce(
    (sum, i) => sum + Number(i.amount_to_invest),
    0
  );
  const totalPlannedUsd = plan.items.reduce(
    (sum, i) => sum + Number(i.amount_to_invest_usd ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/desejados/salvos"
          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-card)] transition-colors"
        >
          <ChevronLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{plan.label}</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {new Date(plan.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Progresso</span>
          <span className="text-sm text-[var(--color-text-muted)]">
            {checkedCount}/{totalItems} concluídos ({progress}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-[var(--color-border)]/40">
          <div
            className="h-full rounded-full bg-[var(--color-positive)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
          <span className="block text-[10px] text-[var(--color-text-muted)]">
            Aporte
          </span>
          <span className="text-sm font-semibold">
            {formatBRL(plan.contribution)}
          </span>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
          <span className="block text-[10px] text-[var(--color-text-muted)]">
            Total Planejado
          </span>
          <span className="text-sm font-semibold">
            {formatBRL(totalPlannedBrl)}
          </span>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
          <span className="block text-[10px] text-[var(--color-text-muted)]">
            Patrimônio Atual
          </span>
          <span className="text-sm font-semibold">
            {formatBRL(plan.patrimonio_atual)}
          </span>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
          <span className="block text-[10px] text-[var(--color-text-muted)]">
            Patrimônio Pós-Aporte
          </span>
          <span className="text-sm font-semibold">
            {formatBRL(plan.patrimonio_pos_aporte)}
          </span>
        </div>
      </div>

      {/* Class breakdown */}
      {classBreakdown.length > 0 && (
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3">
            Distribuição por Classe
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Classe
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Meta %
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Atual %
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Gap (R$)
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {classBreakdown.map((c) => (
                  <tr
                    key={c.asset_class}
                    className="border-b border-[var(--color-border)]/50"
                  >
                    <td className="px-3 py-2">{c.label}</td>
                    <td className="px-3 py-2">
                      {formatPercent(c.target_pct)}
                    </td>
                    <td className="px-3 py-2">
                      {formatPercent(c.current_pct)}
                    </td>
                    <td
                      className={`px-3 py-2 ${Number(c.gap) >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}
                    >
                      {formatBRL(c.gap)}
                    </td>
                    <td className="px-3 py-2">
                      {c.status === "—" ? (
                        <span className="text-xs text-[var(--color-text-muted)]">
                          —
                        </span>
                      ) : (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            c.status === "APORTAR"
                              ? "bg-[var(--color-positive)]/15 text-[var(--color-positive)]"
                              : "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                          }`}
                        >
                          {c.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Items checklist */}
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-secondary)]">
            Plano por Ativo
          </h2>
          {savingChecks && (
            <span className="text-[10px] text-[var(--color-text-muted)]">
              Salvando...
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] w-10"></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Ticker
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Classe
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Valor Atual
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Valor Alvo
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Gap
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Aportar (R$)
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Aportar (USD)
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-[var(--color-border)]/50 transition-colors ${
                    item.is_reserve
                      ? "bg-cyan-500/5"
                      : item.checked
                        ? "bg-[var(--color-positive)]/5"
                        : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleCheck(item.id)}
                      className="p-0.5 transition-colors"
                    >
                      {item.checked ? (
                        <CheckCircle2
                          size={20}
                          className="text-[var(--color-positive)]"
                        />
                      ) : (
                        <Circle
                          size={20}
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                        />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {item.is_reserve ? (
                      <div className="flex items-center gap-2 text-cyan-400">
                        <ShieldCheck size={20} />
                        Reserva Financeira
                      </div>
                    ) : (
                      <div
                        className={`flex items-center gap-2 ${item.checked ? "line-through opacity-60" : ""}`}
                      >
                        <TickerLogo
                          ticker={item.ticker}
                          type={item.asset_class as AssetType}
                          size={20}
                        />
                        {item.ticker}
                      </div>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 ${item.is_reserve ? "text-cyan-400 text-xs font-semibold" : "text-[var(--color-text-secondary)]"} ${item.checked && !item.is_reserve ? "line-through opacity-60" : ""}`}
                  >
                    {item.is_reserve ? "PRIORIDADE" : item.asset_class}
                  </td>
                  <td
                    className={`px-3 py-2 ${item.checked ? "line-through opacity-60" : ""}`}
                  >
                    {formatBRL(item.current_value)}
                  </td>
                  <td
                    className={`px-3 py-2 ${item.checked ? "line-through opacity-60" : ""}`}
                  >
                    {formatBRL(item.target_value)}
                  </td>
                  <td
                    className={`px-3 py-2 ${item.is_reserve ? "text-cyan-400" : "text-[var(--color-positive)]"} ${item.checked ? "line-through opacity-60" : ""}`}
                  >
                    {formatBRL(item.gap)}
                  </td>
                  <td
                    className={`px-3 py-2 font-bold ${item.is_reserve ? "text-cyan-400" : ""} ${item.checked ? "line-through opacity-60" : ""}`}
                  >
                    {formatBRL(item.amount_to_invest)}
                  </td>
                  <td
                    className={`px-3 py-2 text-[var(--color-text-muted)] ${item.checked ? "line-through opacity-60" : ""}`}
                  >
                    {item.amount_to_invest_usd
                      ? formatUSD(item.amount_to_invest_usd)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)] font-bold">
                <td className="px-3 py-2" />
                <td className="px-3 py-2" colSpan={5}>
                  TOTAL PLANEJADO
                </td>
                <td className="px-3 py-2">{formatBRL(totalPlannedBrl)}</td>
                <td className="px-3 py-2">
                  {totalPlannedUsd > 0 ? formatUSD(totalPlannedUsd) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
