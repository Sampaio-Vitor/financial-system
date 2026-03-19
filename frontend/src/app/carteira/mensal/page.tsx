"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { getCurrentMonth } from "@/lib/format";
import { MonthlyOverview } from "@/types";
import MonthNavigator from "@/components/month-navigator";
import SummaryCards from "@/components/summary-cards";
import AllocationBreakdown from "@/components/allocation-breakdown";
import SnapshotAssetsTable from "@/components/snapshot-assets-table";
import DetailDrawer from "@/components/detail-drawer";

export default function MensalPage() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<MonthlyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  useEffect(() => {
    setExpandedCard(null);
  }, [month]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await apiFetch<MonthlyOverview>(
        `/portfolio/overview?month=${month}`
      );
      setData(overview);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Mensal</h1>
          <MonthNavigator month={month} onChange={setMonth} />
        </div>
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-[104px] rounded-2xl bg-[var(--color-bg-card)]/80 border border-[var(--color-border)]" />
            ))}
          </div>
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
          <h1 className="text-2xl font-extrabold tracking-tight">Mensal</h1>
          <MonthNavigator month={month} onChange={setMonth} />
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
        <h1 className="text-2xl font-extrabold tracking-tight">Mensal</h1>
        <MonthNavigator month={month} onChange={setMonth} minMonth={data.min_month} />
      </div>

      <div>
        <SummaryCards
          cards={[
            { label: "Patrimônio Total", value: data.patrimonio_total, format: "brl" },
            { label: "Aportes do Mês", value: data.aportes_do_mes, format: "brl", expandable: true },
            { label: "Resgates do Mês", value: data.resgates_do_mes, format: "brl", expandable: true },
            { label: "Variação do Mês", value: data.variacao_mes, format: "brl", colorBySign: true },
            { label: "Variação (%)", value: data.variacao_mes_pct, format: "percent", colorBySign: true },
          ]}
          expandedCard={expandedCard}
          onToggleCard={(label) => setExpandedCard((prev) => (prev === label ? null : label))}
        />
        {expandedCard === "Aportes do Mês" && (
          <DetailDrawer type="aportes" data={data} />
        )}
        {expandedCard === "Resgates do Mês" && (
          <DetailDrawer type="resgates" data={data} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AllocationBreakdown
          items={data.allocation_breakdown}
          patrimonioTotal={data.patrimonio_total}
          reservaFinanceira={data.reserva_financeira}
          reservaTarget={data.reserva_target}
        />
        <div className="relative">
          <div className="lg:absolute lg:inset-0">
            <SnapshotAssetsTable month={month} />
          </div>
        </div>
      </div>
    </div>
  );
}
