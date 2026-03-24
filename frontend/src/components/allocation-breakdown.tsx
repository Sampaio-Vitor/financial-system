import { formatBRL } from "@/lib/format";
import { ClassSummary } from "@/types";
import { TrendingUp, Building2, Landmark, PiggyBank, Shield } from "lucide-react";

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
        Alocacao por Classe
      </h3>

      <div className="space-y-5">
        {items.map((item) => {
          const Icon = classIcons[item.asset_class] || TrendingUp;
          const color = classColors[item.asset_class] || "#64748b";
          const pct = Number(item.pct);
          const targetPct = Number(item.target_pct);
          const barWidth = Math.min((pct / scale) * 100, 100);
          const markerPos = Math.min((targetPct / scale) * 100, 100);
          const onTarget = pct >= targetPct;
          const targetValue = (targetPct / 100) * patrimonioInvestivel;

          return (
            <div key={item.asset_class}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Icon size={16} style={{ color }} />
                  </div>
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs md:text-sm tabular-nums">
                    <span className="font-semibold">{formatBRL(item.value)}</span>
                    <span className="text-[var(--color-text-muted)] hidden md:inline"> / {formatBRL(targetValue)}</span>
                  </span>
                  <span
                    className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded ${
                      onTarget
                        ? "bg-[var(--color-positive)]/15 text-[var(--color-positive)]"
                        : "bg-[var(--color-negative)]/15 text-[var(--color-negative)]"
                    }`}
                  >
                    {pct.toFixed(1)}%
                  </span>
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

              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {pct > 0 ? `${pct.toFixed(1)}% atual` : "sem posicao"}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  meta {targetPct.toFixed(0)}%
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
              const onTarget = target ? reserva >= target : true;

              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${reserveColor}20` }}
                      >
                        <Shield size={16} style={{ color: reserveColor }} />
                      </div>
                      <span className="text-sm font-medium">Reserva Financeira</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm tabular-nums">
                        <span className="font-semibold">{formatBRL(reserva)}</span>
                        {target && (
                          <span className="text-[var(--color-text-muted)]"> / {formatBRL(target)}</span>
                        )}
                      </span>
                      {target && (
                        <span
                          className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded ${
                            onTarget
                              ? "bg-[var(--color-positive)]/15 text-[var(--color-positive)]"
                              : "bg-[var(--color-negative)]/15 text-[var(--color-negative)]"
                          }`}
                        >
                          {((reserva / target) * 100).toFixed(1)}%
                        </span>
                      )}
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

                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      valor fixo
                    </span>
                    {target && (
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        meta {formatBRL(target)}
                      </span>
                    )}
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
