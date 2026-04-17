"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatBRL } from "@/lib/format";
import { ClassSummary, AllocationBucket } from "@/types";

const REGION_COLORS: Record<string, string> = {
  Brasil: "#10b981",
  "EUA / Internacional": "#3b82f6",
};

const BUCKET_TO_REGION: Record<AllocationBucket, string> = {
  STOCK_BR: "Brasil",
  FII: "Brasil",
  RF: "Brasil",
  STOCK_US: "EUA / Internacional",
  ETF_INTL: "EUA / Internacional",
};

interface GeographyDonutChartProps {
  items: ClassSummary[];
  patrimonioTotal: number;
  reservaFinanceira?: number | null;
}

export default function GeographyDonutChart({
  items,
  patrimonioTotal,
  reservaFinanceira,
}: GeographyDonutChartProps) {
  const totals: Record<string, number> = {};

  for (const item of items) {
    const bucket = (item.allocation_bucket || item.asset_class) as AllocationBucket | undefined;
    if (!bucket) continue;
    const region = BUCKET_TO_REGION[bucket];
    if (!region) continue;
    const value = Number(item.value);
    if (value <= 0) continue;
    totals[region] = (totals[region] || 0) + value;
  }

  if (reservaFinanceira && Number(reservaFinanceira) > 0) {
    totals["Brasil"] = (totals["Brasil"] || 0) + Number(reservaFinanceira);
  }

  const chartData = Object.entries(totals).map(([name, value]) => ({
    name,
    value,
    pct: patrimonioTotal > 0 ? (value / patrimonioTotal) * 100 : 0,
    color: REGION_COLORS[name] || "#64748b",
  }));

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
