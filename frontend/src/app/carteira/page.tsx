"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { formatBRL, getCurrentMonth } from "@/lib/format";
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Painel</h1>
          <MonthNavigator month={month} onChange={setMonth} />
        </div>
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
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
          <h1 className="text-2xl font-extrabold tracking-tight">Painel</h1>
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
        <h1 className="text-2xl font-extrabold tracking-tight">Painel</h1>
        <div className="flex items-center gap-4">
          {isCurrentMonth && <PriceUpdateButton onComplete={fetchData} />}
          <MonthNavigator month={month} onChange={setMonth} minMonth={data.min_month} />
        </div>
      </div>

      <SummaryCards
        cards={[
          { label: "Patrimônio Total", value: data.patrimonio_total, format: "brl" },
          { label: "Aportes do Mês", value: data.aportes_do_mes, format: "brl" },
          { label: "Variação do Mês", value: data.variacao_mes, format: "brl", colorBySign: true },
          { label: "Variação (%)", value: data.variacao_mes_pct, format: "percent", colorBySign: true },
        ]}
      />

      {/* Reserva card */}
      {data.reserva_financeira != null && (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)] tracking-tight">
              Reserva Financeira
            </h3>
            <span className="text-lg font-bold">{formatBRL(data.reserva_financeira)}</span>
          </div>
          {data.reserva_target != null && (
            <div>
              <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-1">
                <span>
                  {Math.min(
                    (data.reserva_financeira / data.reserva_target) * 100,
                    100
                  ).toFixed(1)}
                  % da meta
                </span>
                <span>
                  {formatBRL(data.reserva_financeira)} / {formatBRL(data.reserva_target)}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-[var(--color-bg-main)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      (data.reserva_financeira / data.reserva_target) * 100,
                      100
                    )}%`,
                    backgroundColor:
                      data.reserva_financeira >= data.reserva_target
                        ? "var(--color-positive)"
                        : "#06b6d4",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AllocationBreakdown items={data.allocation_breakdown} />
        <PatrimonioChart data={data.daily_patrimonio} month={month} />
      </div>

      <MonthTransactions transactions={data.transactions} />
    </div>
  );
}
