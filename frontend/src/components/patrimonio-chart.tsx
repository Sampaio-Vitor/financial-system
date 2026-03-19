"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { formatBRL, getMonthLabel } from "@/lib/format";
import { PatrimonioEvolutionPoint } from "@/types";

export default function PatrimonioChart() {
  const [data, setData] = useState<PatrimonioEvolutionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchEvolution = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<PatrimonioEvolutionPoint[]>(
        "/snapshots/evolution"
      );
      setData(result);
    } catch {
      setData([]);
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

  if (loading) {
    return (
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-6 tracking-tight">
          Evolucao do Patrimonio
        </h3>
        <div className="h-48 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-6 tracking-tight">
          Evolucao do Patrimonio
        </h3>
        <div className="h-48 flex flex-col items-center justify-center gap-3">
          <p className="text-[var(--color-text-muted)] text-sm font-medium">
            Nenhum snapshot historico gerado
          </p>
          <button
            onClick={handleGenerateAll}
            disabled={generating}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {generating ? "Gerando snapshots..." : "Gerar Snapshots Historicos"}
          </button>
          {generating && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Isso pode levar alguns minutos...
            </p>
          )}
        </div>
      </div>
    );
  }

  const chartData = data.map((p) => ({
    month: p.month,
    label: p.month.slice(5) + "/" + p.month.slice(2, 4),
    patrimonio: Number(p.total_patrimonio),
    investido: Number(p.total_invested),
  }));

  return (
    <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] tracking-tight">
          Evolucao do Patrimonio
        </h3>
        <button
          onClick={handleGenerateAll}
          disabled={generating}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
        >
          {generating ? "Atualizando..." : "Atualizar"}
        </button>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gradPatrimonio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={{ stroke: "#2a2d3a" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e2130",
                border: "1px solid #2a2d3a",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "12px",
              }}
              formatter={(v: number, name: string) => [
                formatBRL(v),
                name === "patrimonio" ? "Patrimonio" : "Investido",
              ]}
              labelFormatter={(_label: string, payload: unknown) => {
                const items = payload as Array<{ payload: { month: string } }>;
                if (items && items.length > 0) {
                  return getMonthLabel(items[0].payload.month);
                }
                return _label;
              }}
            />
            <Area
              type="monotone"
              dataKey="patrimonio"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gradPatrimonio)"
            />
            <Area
              type="monotone"
              dataKey="investido"
              stroke="#8b5cf6"
              strokeWidth={2}
              strokeDasharray="5 5"
              fill="none"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-3 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-emerald-500 rounded" />
          <span className="text-xs text-[var(--color-text-muted)]">Patrimonio</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-violet-500 rounded" style={{ borderTop: "2px dashed #8b5cf6", height: 0 }} />
          <span className="text-xs text-[var(--color-text-muted)]">Investido</span>
        </div>
      </div>
    </div>
  );
}
