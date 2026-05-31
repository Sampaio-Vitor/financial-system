"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { MonthlyOverview } from "@/types";
import AllocationBreakdown from "@/components/allocation-breakdown";
import ChartTabs from "@/components/chart-tabs";
import NotificationBell from "@/components/notification-bell";

export default function VisaoGeralPage() {
  const [data, setData] = useState<MonthlyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [mainPanel, setMainPanel] = useState<"allocation" | "charts">("allocation");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await apiFetch<MonthlyOverview>("/portfolio/overview");
      setData(overview);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Visão Geral</h1>
          <div className="hidden md:block">
            <NotificationBell />
          </div>
        </div>
        <div className="animate-pulse space-y-6">
          <div className="h-28 rounded-2xl bg-[var(--color-bg-card)]/80 border border-[var(--color-border)]" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-72 rounded-2xl bg-[var(--color-bg-card)]/80 border border-[var(--color-border)]" />
            <div className="h-72 rounded-2xl bg-[var(--color-bg-card)]/80 border border-[var(--color-border)]" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Visão Geral</h1>
          <div className="hidden md:block">
            <NotificationBell />
          </div>
        </div>
        <div className="p-8 text-center bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)]">
          <p className="text-[var(--color-text-muted)] font-medium">Erro ao carregar dados do portfólio.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Visão Geral</h1>
        <div className="hidden md:block">
          <NotificationBell />
        </div>
      </div>

      {/* Hero: Patrimônio Total */}
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 md:p-8 shadow-sm">
        <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">Patrimônio Total</p>
        <p className="text-2xl md:text-4xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          {formatBRL(data.patrimonio_total)}
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 shadow-sm md:p-4">
          <label className="block md:hidden">
            <span className="sr-only">Selecionar painel</span>
            <select
              value={mainPanel}
              onChange={(event) => setMainPanel(event.target.value as "charts" | "allocation")}
              className="h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-sm font-medium text-[var(--color-text-primary)]"
            >
              <option value="allocation">Alocação por Classe</option>
              <option value="charts">Gráficos</option>
            </select>
          </label>

          <div className="hidden overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-1 md:grid md:grid-cols-2 md:gap-1">
            <button
              onClick={() => setMainPanel("allocation")}
              className={`min-h-10 rounded-md px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset ${
                mainPanel === "allocation"
                  ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              Alocação por Classe
            </button>
            <button
              onClick={() => setMainPanel("charts")}
              className={`min-h-10 rounded-md px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset ${
                mainPanel === "charts"
                  ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              Gráficos
            </button>
          </div>
        </div>

        {mainPanel === "charts" ? (
          <ChartTabs
            allocationItems={data.allocation_breakdown}
            patrimonioTotal={data.patrimonio_total}
            reservaFinanceira={data.reserva_financeira}
          />
        ) : (
          <AllocationBreakdown
            items={data.allocation_breakdown}
            patrimonioTotal={data.patrimonio_total}
            reservaFinanceira={data.reserva_financeira}
            reservaTarget={data.reserva_target}
          />
        )}
      </div>
    </div>
  );
}
