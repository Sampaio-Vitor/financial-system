"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { MonthlyOverview } from "@/types";
import AllocationBreakdown from "@/components/allocation-breakdown";
import ChartTabs from "@/components/chart-tabs";
import PriceUpdateButton from "@/components/price-update-button";

export default function VisaoGeralPage() {
  const [data, setData] = useState<MonthlyOverview | null>(null);
  const [loading, setLoading] = useState(true);

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
        <PriceUpdateButton onComplete={fetchData} />
      </div>

      {/* Hero: Patrimônio Total */}
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 md:p-8 shadow-sm">
        <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-1">Patrimônio Total</p>
        <p className="text-2xl md:text-4xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          {formatBRL(data.patrimonio_total)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AllocationBreakdown
          items={data.allocation_breakdown}
          patrimonioTotal={data.patrimonio_total}
          reservaFinanceira={data.reserva_financeira}
          reservaTarget={data.reserva_target}
        />
        <ChartTabs
          allocationItems={data.allocation_breakdown}
          patrimonioTotal={data.patrimonio_total}
          reservaFinanceira={data.reserva_financeira}
        />
      </div>
    </div>
  );
}
