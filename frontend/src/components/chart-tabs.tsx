"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { PatrimonioEvolutionPoint, ClassSummary } from "@/types";
import PatrimonioChart from "@/components/patrimonio-chart";
import AporteVsPatrimonioChart from "@/components/aporte-vs-patrimonio-chart";
import AllocationDonutChart from "@/components/allocation-donut-chart";

const TABS = [
  { key: "evolucao", label: "Evolução" },
  { key: "aporte-vs-patrimonio", label: "Aporte vs Patrimônio" },
  { key: "alocacao", label: "Alocação" },
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
    <div className="h-48 flex flex-col items-center justify-center gap-3">
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
          reservaFinanceira={reservaFinanceira}
        />
      );
    }

    if (loading) {
      return (
        <div className="h-48 flex items-center justify-center">
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
    <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 bg-[var(--color-bg-main)] rounded-lg p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === tab.key
                  ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab !== "alocacao" && evolutionData.length > 0 && (
          <button
            onClick={handleGenerateAll}
            disabled={generating}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
          >
            {generating ? "Atualizando..." : "Atualizar"}
          </button>
        )}
      </div>
      {renderTabContent()}
    </div>
  );
}
