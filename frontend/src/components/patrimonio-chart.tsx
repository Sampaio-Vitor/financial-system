"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBRL } from "@/lib/format";
import { DailyPatrimonio } from "@/types";

interface PatrimonioChartProps {
  data: DailyPatrimonio[];
  month: string;
}

export default function PatrimonioChart({ data, month }: PatrimonioChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-6 tracking-tight">
          Evolução do Patrimônio
        </h3>
        <div className="h-48 flex items-center justify-center text-[var(--color-text-muted)] text-sm font-medium">
          Dados de evolução diária não disponíveis para {month}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-6 tracking-tight">
        Evolução do Patrimônio
      </h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis
              dataKey="day"
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
              formatter={(v: number) => [formatBRL(v), "Patrimonio"]}
              labelFormatter={(d) => `Dia ${d}`}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
