"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { getCurrentMonth } from "@/lib/format";
import { MonthlyOverview } from "@/types";
import MonthNavigator from "@/components/month-navigator";
import SummaryCards from "@/components/summary-cards";
import AllocationBreakdown from "@/components/allocation-breakdown";
import PatrimonioChart from "@/components/patrimonio-chart";
import MonthTransactions from "@/components/month-transactions";
import PriceUpdateButton from "@/components/price-update-button";

export default function CarteiraOverview() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<MonthlyOverview | null>(null);
  const [loading, setLoading] = useState(true);

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

  const isCurrentMonth = month === getCurrentMonth();

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Painel</h1>
          <MonthNavigator month={month} onChange={setMonth} />
        </div>
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-[var(--color-bg-card)]" />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-[var(--color-bg-card)]" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Painel</h1>
          <MonthNavigator month={month} onChange={setMonth} />
        </div>
        <p className="text-[var(--color-text-muted)]">Erro ao carregar dados</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Painel</h1>
        <div className="flex items-center gap-4">
          {isCurrentMonth && <PriceUpdateButton onComplete={fetchData} />}
          <MonthNavigator month={month} onChange={setMonth} />
        </div>
      </div>

      <SummaryCards
        cards={[
          { label: "Patrimonio Total", value: data.patrimonio_total, format: "brl" },
          { label: "Aportes do Mes", value: data.aportes_do_mes, format: "brl" },
          { label: "Variacao do Mes", value: data.variacao_mes, format: "brl", colorBySign: true },
          { label: "Variacao (%)", value: data.variacao_mes_pct, format: "percent", colorBySign: true },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AllocationBreakdown items={data.allocation_breakdown} />
        <PatrimonioChart data={data.daily_patrimonio} month={month} />
      </div>

      <MonthTransactions transactions={data.transactions} />
    </div>
  );
}
