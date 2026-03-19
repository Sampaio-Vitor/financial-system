"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBRL, getMonthLabel } from "@/lib/format";
import { PatrimonioEvolutionPoint } from "@/types";

interface AporteVsPatrimonioChartProps {
  data: PatrimonioEvolutionPoint[];
}

export default function AporteVsPatrimonioChart({ data }: AporteVsPatrimonioChartProps) {
  if (data.length === 0) return null;

  const chartData = data.map((p, i) => {
    const patrimonio = Number(p.total_patrimonio);
    const invested = Number(p.total_invested);
    const prevInvested = i > 0 ? Number(data[i - 1].total_invested) : 0;
    const aportes = Math.max(0, invested - prevInvested);
    const jaExistente = patrimonio - aportes;

    return {
      month: p.month,
      label: p.month.slice(5) + "/" + p.month.slice(2, 4),
      aportes,
      jaExistente: Math.max(0, jaExistente),
      patrimonio,
    };
  });

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
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
                name === "aportes" ? "Aportes do Mês" : "Patrimônio Existente",
              ]}
              labelFormatter={(_label: string, payload: unknown) => {
                const items = payload as Array<{ payload: { month: string; patrimonio: number } }>;
                if (items && items.length > 0) {
                  const p = items[0].payload;
                  return `${getMonthLabel(p.month)} — Total: ${formatBRL(p.patrimonio)}`;
                }
                return _label;
              }}
            />
            <Bar
              dataKey="jaExistente"
              stackId="a"
              fill="#10b981"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="aportes"
              stackId="a"
              fill="#8b5cf6"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-3 justify-center shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
          <span className="text-xs text-[var(--color-text-muted)]">Patrimônio Existente</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-violet-500 rounded-sm" />
          <span className="text-xs text-[var(--color-text-muted)]">Aportes do Mês</span>
        </div>
      </div>
    </div>
  );
}
