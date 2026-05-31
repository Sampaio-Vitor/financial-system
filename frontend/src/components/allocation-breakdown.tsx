import { formatBRL } from "@/lib/format";
import { ClassSummary } from "@/types";
import { TrendingUp, Building2, Landmark, PiggyBank, Shield } from "lucide-react";

const classIcons: Record<string, typeof TrendingUp> = {
  STOCK_BR: Building2,
  STOCK_US: TrendingUp,
  ETF_INTL: TrendingUp,
  FII: Landmark,
  RF: PiggyBank,
};

const classColors: Record<string, string> = {
  STOCK_BR: "#10b981",
  STOCK_US: "#3b82f6",
  ETF_INTL: "#0ea5e9",
  FII: "#f59e0b",
  RF: "#8b5cf6",
};

interface AllocationBreakdownProps {
  items: ClassSummary[];
  patrimonioTotal: number;
  reservaFinanceira?: number | null;
  reservaTarget?: number | null;
}

export default function AllocationBreakdown({ items, patrimonioTotal, reservaFinanceira, reservaTarget }: AllocationBreakdownProps) {
  // Fixed 0-100% scale so all bars are comparable
  const scale = 100;
  // Targets apply to investable patrimony (excluding fixed reserve)
  const patrimonioInvestivel = patrimonioTotal - (reservaFinanceira ?? 0);

  return (
    <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 md:p-6 shadow-sm">
      <h3 className="text-base font-semibold mb-5 text-[var(--color-text-primary)] tracking-tight">
        Alocação por Classe
      </h3>

      <div className="space-y-5">
        {items.filter((item) => Number(item.value) > 0 || Number(item.target_pct) > 0).map((item) => {
          const bucket = item.allocation_bucket || item.asset_class || "RF";
          const Icon = classIcons[bucket] || TrendingUp;
          const color = classColors[bucket] || "#64748b";
          const pct = Number(item.pct);
          const targetPct = Number(item.target_pct);
          const barWidth = Math.min((pct / scale) * 100, 100);
          const markerPos = Math.min((targetPct / scale) * 100, 100);
          const targetValue = (targetPct / 100) * patrimonioInvestivel;
          const diffPct = pct - targetPct;

          return (
            <div key={bucket}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Icon size={16} style={{ color }} />
                  </div>
                  <span className="truncate text-sm font-medium">{item.label}</span>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <div className="text-sm font-semibold">{pct.toFixed(1)}%</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">meta {targetPct.toFixed(0)}%</div>
                </div>
              </div>

              <div className="relative h-1.5 rounded-full bg-[var(--color-border)]/40">
                {/* Actual allocation bar */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: color,
                  }}
                />
                {/* Target marker */}
                {targetPct > 0 && (
                  <div
                    className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full"
                    style={{
                      left: `${markerPos}%`,
                      backgroundColor: "var(--color-text-secondary)",
                    }}
                    title={`Meta: ${targetPct.toFixed(0)}%`}
                  />
                )}
              </div>

              <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-[var(--color-text-muted)]">
                <span className="truncate">
                  {formatBRL(item.value)}
                  {targetPct > 0 && (
                    <span className="ml-1 text-[var(--color-text-secondary)]">
                      / meta {formatBRL(targetValue)}
                    </span>
                  )}
                </span>
                <span className={`shrink-0 tabular-nums ${
                  Math.abs(diffPct) < 0.1
                    ? "text-[var(--color-text-muted)]"
                    : diffPct > 0
                      ? "text-[var(--color-warning)]"
                      : "text-[var(--color-text-secondary)]"
                }`}>
                  {diffPct > 0 ? "+" : ""}{diffPct.toFixed(1)} p.p.
                </span>
              </div>
            </div>
          );
        })}

        {/* Reserve bar — separate from allocation classes */}
        {reservaFinanceira != null && (
          <>
            <div className="border-t border-[var(--color-border)]/50" />
            {(() => {
              const reserva = Number(reservaFinanceira);
              const target = reservaTarget ? Number(reservaTarget) : null;
              const reserveColor = "#06b6d4";
              const barW = target ? Math.min((reserva / target) * 100, 100) : 100;
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${reserveColor}20` }}
                      >
                        <Shield size={16} style={{ color: reserveColor }} />
                      </div>
                      <span className="truncate text-sm font-medium">Reserva Financeira</span>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div className="text-sm font-semibold">{target ? `${Math.round((reserva / target) * 100)}%` : "100%"}</div>
                      {target && <div className="text-[10px] text-[var(--color-text-muted)]">meta</div>}
                    </div>
                  </div>

                  <div className="relative h-1.5 rounded-full bg-[var(--color-border)]/40">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all"
                      style={{
                        width: `${barW}%`,
                        backgroundColor: reserveColor,
                      }}
                    />
                    {target && (
                      <div
                        className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full"
                        style={{
                          left: "100%",
                          backgroundColor: "var(--color-text-secondary)",
                        }}
                        title={`Meta: ${formatBRL(target)}`}
                      />
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-[var(--color-text-muted)]">
                    <span className="truncate">{formatBRL(reserva)}</span>
                    {target && <span className="shrink-0 tabular-nums">meta {formatBRL(target)}</span>}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
