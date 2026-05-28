"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { PatrimonioEvolutionPoint, ClassSummary } from "@/types";
import PatrimonioChart from "@/components/patrimonio-chart";
import AporteVsPatrimonioChart from "@/components/aporte-vs-patrimonio-chart";
import AllocationDonutChart from "@/components/allocation-donut-chart";
import GeographyDonutChart from "@/components/geography-donut-chart";

const TABS = [
  { key: "evolucao", label: "Evolução" },
  { key: "aporte-vs-patrimonio", label: "Aporte vs Patrimônio" },
  { key: "alocacao", label: "Alocação" },
  { key: "geografia", label: "Geografia" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface ChartTabsProps {
  allocationItems: ClassSummary[];
  patrimonioTotal: number;
  reservaFinanceira?: number | null;
}

export default function ChartTabs({
  allocationItems,
  patrimonioTotal,
  reservaFinanceira,
}: ChartTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("evolucao");
  const [evolutionData, setEvolutionData] = useState<PatrimonioEvolutionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchEvolution = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<PatrimonioEvolutionPoint[]>("/snapshots/evolution");
      setEvolutionData(result);
    } catch {
      setEvolutionData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvolution();
  }, [fetchEvolution]);

  const handleGenerateAll = async () => {
    setGenerating(true);
    try {
      await apiFetch("/snapshots/generate-all", { method: "POST" });
      await fetchEvolution();
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const renderEmptyState = () => (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <p className="text-[var(--color-text-muted)] text-sm font-medium">
        Nenhum snapshot histórico gerado
      </p>
      <button
        onClick={handleGenerateAll}
        disabled={generating}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {generating ? "Gerando snapshots..." : "Gerar Snapshots Históricos"}
      </button>
      {generating && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Isso pode levar alguns minutos...
        </p>
      )}
    </div>
  );

  const renderTabContent = () => {
    if (activeTab === "alocacao") {
      return (
        <AllocationDonutChart
          items={allocationItems}
          patrimonioTotal={patrimonioTotal}
        />
      );
    }

    if (activeTab === "geografia") {
      return (
        <GeographyDonutChart
          items={allocationItems}
          patrimonioTotal={patrimonioTotal}
          reservaFinanceira={reservaFinanceira}
        />
      );
    }

    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
        </div>
      );
    }

    if (evolutionData.length === 0) {
      return renderEmptyState();
    }

    if (activeTab === "evolucao") {
      return <PatrimonioChart data={evolutionData} />;
    }

    return <AporteVsPatrimonioChart data={evolutionData} />;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-3 md:p-5 shadow-sm flex flex-col min-h-[330px] md:min-h-[400px]">
        <div className="mb-4 md:mb-5 md:flex md:items-center">
          <label className="block md:hidden">
            <span className="sr-only">Selecionar gráfico</span>
            <select
              value={activeTab}
              onChange={(event) => setActiveTab(event.target.value as TabKey)}
              className="h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 text-sm font-medium text-[var(--color-text-primary)]"
            >
              {TABS.map((tab) => (
                <option key={tab.key} value={tab.key}>
                  {tab.label}
                </option>
              ))}
            </select>
          </label>

          <div className="hidden min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-1 md:block">
            <div className="grid min-w-0 grid-cols-4 gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`min-h-9 min-w-0 rounded-md px-2 py-1.5 text-center text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset ${
                    activeTab === tab.key
                      ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  }`}
                >
                  <span className="block truncate">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}
