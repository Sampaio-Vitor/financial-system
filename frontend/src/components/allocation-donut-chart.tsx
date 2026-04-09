"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatBRL } from "@/lib/format";
import { ClassSummary } from "@/types";

const CLASS_COLORS: Record<string, string> = {
  STOCK_BR: "#10b981",
  STOCK_US: "#3b82f6",
  ETF_INTL: "#0ea5e9",
  FII: "#f59e0b",
  RF: "#8b5cf6",
};

interface AllocationDonutChartProps {
  items: ClassSummary[];
  patrimonioTotal: number;
  reservaFinanceira?: number | null;
}

export default function AllocationDonutChart({
  items,
  patrimonioTotal,
  reservaFinanceira,
}: AllocationDonutChartProps) {
  const chartData = items
    .filter((item) => Number(item.value) > 0)
    .map((item) => ({
      name: item.label,
      value: Number(item.value),
      pct: Number(item.pct),
      color: CLASS_COLORS[item.allocation_bucket || item.asset_class || "RF"] || "#64748b",
    }));

  if (reservaFinanceira && Number(reservaFinanceira) > 0) {
    const reservaPct = patrimonioTotal > 0
      ? (Number(reservaFinanceira) / patrimonioTotal) * 100
      : 0;
    chartData.push({
      name: "Reserva",
      value: Number(reservaFinanceira),
      pct: reservaPct,
      color: "#06b6d4",
    });
  }

  if (chartData.length === 0) return null;

  return (
    <div className="flex-1 flex flex-col relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="85%"
            dataKey="value"
            strokeWidth={2}
            stroke="var(--color-bg-card)"
          >
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e2130",
              border: "1px solid #2a2d3a",
              borderRadius: "8px",
              color: "#f8fafc",
              fontSize: "12px",
              zIndex: 50,
            }}
            itemStyle={{ color: "#f8fafc" }}
            formatter={(value: number, name: string) => [formatBRL(value), name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xs text-[var(--color-text-muted)]">Patrimônio</span>
        <span className="text-sm font-bold text-[var(--color-text-primary)]">
          {formatBRL(patrimonioTotal)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 justify-center shrink-0">
        {chartData.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-[var(--color-text-muted)]">
              {entry.name} {entry.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
