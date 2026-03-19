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

  const chartData = data.map((p) => ({
    month: p.month,
    label: p.month.slice(5) + "/" + p.month.slice(2, 4),
    investido: Number(p.total_invested),
    rendimento: Math.max(0, Number(p.total_patrimonio) - Number(p.total_invested)),
  }));

  return (
    <div className="h-48">
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
              name === "investido" ? "Total Aportado" : "Rendimento",
            ]}
            labelFormatter={(_label: string, payload: unknown) => {
              const items = payload as Array<{ payload: { month: string } }>;
              if (items && items.length > 0) {
                return getMonthLabel(items[0].payload.month);
              }
              return _label;
            }}
          />
          <Bar
            dataKey="investido"
            stackId="a"
            fill="#8b5cf6"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="rendimento"
            stackId="a"
            fill="#10b981"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-violet-500 rounded-sm" />
          <span className="text-xs text-[var(--color-text-muted)]">Total Aportado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
          <span className="text-xs text-[var(--color-text-muted)]">Rendimento</span>
        </div>
      </div>
    </div>
  );
}
