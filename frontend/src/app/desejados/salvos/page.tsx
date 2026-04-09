"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { SavedPlanSummary } from "@/types";
import { formatBRL } from "@/lib/format";
import { Trash2, ChevronLeft, FileText } from "lucide-react";
import Link from "next/link";
import { useConfirm } from "@/components/ui/confirm-modal";

export default function SavedPlansPage() {
  const [plans, setPlans] = useState<SavedPlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm, ConfirmDialog } = useConfirm();

  const fetchPlans = useCallback(async () => {
    try {
      const data = await apiFetch<SavedPlanSummary[]>("/saved-plans");
      setPlans(data);
    } catch {
      toast.error("Erro ao carregar planejamentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleDelete = async (id: number) => {
    const ok = await confirm(
      "Excluir Planejamento",
      "Excluir este planejamento salvo? Esta ação não pode ser desfeita.",
      "Excluir"
    );
    if (!ok) return;
    try {
      await apiFetch(`/saved-plans/${id}`, { method: "DELETE" });
      setPlans((prev) => prev.filter((p) => p.id !== id));
      toast.success("Planejamento excluído");
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/desejados"
          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-card)] transition-colors"
        >
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold">Planejamentos Salvos</h1>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      ) : plans.length === 0 ? (
        <div className="text-center py-16">
          <FileText
            size={48}
            className="mx-auto mb-4 text-[var(--color-text-muted)] opacity-40"
          />
          <p className="text-sm text-[var(--color-text-muted)]">
            Nenhum planejamento salvo ainda.
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Calcule um plano de aporte e clique em &quot;Salvar Recomendação&quot;.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {plans.map((plan) => {
            const progressPct =
              plan.items_count > 0
                ? Math.round((plan.checked_count / plan.items_count) * 100)
                : 0;
            const progressBrl =
              plan.total_planned > 0
                ? Math.round((Number(plan.checked_amount) / Number(plan.total_planned)) * 100)
                : 0;
            return (
              <div
                key={plan.id}
                className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <Link
                  href={`/desejados/salvos/${plan.id}`}
                  className="flex-1 min-w-0"
                >
                  <p className="text-sm font-semibold truncate">{plan.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Aporte: {formatBRL(plan.contribution)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)]/40">
                      <div
                        className="h-full rounded-full bg-[var(--color-positive)] transition-all"
                        style={{ width: `${progressBrl}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[var(--color-text-muted)] whitespace-nowrap">
                      {formatBRL(plan.checked_amount)} / {formatBRL(plan.total_planned)} ({progressPct}%)
                    </span>
                  </div>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {new Date(plan.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  <button
                    onClick={() => handleDelete(plan.id)}
                    className="p-1.5 rounded-lg text-[var(--color-negative)] hover:bg-[var(--color-negative)]/10 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog />
    </div>
  );
}
