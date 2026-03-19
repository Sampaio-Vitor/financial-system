"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBRL, getMonthLabel } from "@/lib/format";
import { PatrimonioEvolutionPoint } from "@/types";

interface PatrimonioChartProps {
  data: PatrimonioEvolutionPoint[];
}

export default function PatrimonioChart({ data }: PatrimonioChartProps) {
  if (data.length === 0) return null;

  const chartData = data.map((p) => ({
    month: p.month,
    label: p.month.slice(5) + "/" + p.month.slice(2, 4),
    patrimonio: Number(p.total_patrimonio),
    investido: Number(p.total_invested),
  }));

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 min-h-0">
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
                name === "patrimonio" ? "Patrimônio" : "Investido",
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
      <div className="flex items-center gap-4 mt-3 justify-center shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-emerald-500 rounded" />
          <span className="text-xs text-[var(--color-text-muted)]">Patrimônio</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-violet-500 rounded" style={{ borderTop: "2px dashed #8b5cf6", height: 0 }} />
          <span className="text-xs text-[var(--color-text-muted)]">Investido</span>
        </div>
      </div>
    </div>
  );
}
