import { formatBRL, formatPercent } from "@/lib/format";
import { ClassSummary } from "@/types";
import { TrendingUp, Building2, Landmark, PiggyBank } from "lucide-react";

const classIcons: Record<string, typeof TrendingUp> = {
  STOCK: TrendingUp,
  ACAO: Building2,
  FII: Landmark,
  RF: PiggyBank,
};

const classColors: Record<string, string> = {
  STOCK: "#3b82f6",
  ACAO: "#10b981",
  FII: "#f59e0b",
  RF: "#8b5cf6",
};

interface AllocationBreakdownProps {
  items: ClassSummary[];
}

export default function AllocationBreakdown({ items }: AllocationBreakdownProps) {
  return (
    <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-5">
      <h3 className="text-sm font-semibold mb-4 text-[var(--color-text-secondary)]">
        Alocacao por Classe
      </h3>

      <div className="space-y-4">
        {items.map((item) => {
          const Icon = classIcons[item.asset_class] || TrendingUp;
          const color = classColors[item.asset_class] || "#64748b";
          const progress = Math.min(
            (item.pct / (item.target_pct || 1)) * 100,
            100
          );

          return (
            <div key={item.asset_class} className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${color}20` }}
              >
                <Icon size={18} style={{ color }} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">
                    {item.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {formatBRL(item.value)}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        item.gap >= 0
                          ? "bg-[var(--color-positive)]/15 text-[var(--color-positive)]"
                          : "bg-[var(--color-negative)]/15 text-[var(--color-negative)]"
                      }`}
                    >
                      {formatPercent(item.pct)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg-main)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
                    de {formatPercent(item.target_pct)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
