import { formatBRL } from "@/lib/format";
import { Purchase } from "@/types";
import { TrendingUp, Building2, Landmark, PiggyBank } from "lucide-react";

const typeIcons: Record<string, typeof TrendingUp> = {
  STOCK: TrendingUp,
  ACAO: Building2,
  FII: Landmark,
  RF: PiggyBank,
};

const typeColors: Record<string, string> = {
  STOCK: "#3b82f6",
  ACAO: "#10b981",
  FII: "#f59e0b",
  RF: "#8b5cf6",
};

interface MonthTransactionsProps {
  transactions: Purchase[];
}

export default function MonthTransactions({ transactions }: MonthTransactionsProps) {
  return (
    <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-6 tracking-tight">
        Aportes do Período
      </h3>

      {transactions.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">
          Nenhum aporte neste periodo
        </p>
      ) : (
        <div className="space-y-3">
          {transactions.map((t) => {
            const Icon = typeIcons[t.asset_type || "STOCK"] || TrendingUp;
            const color = typeColors[t.asset_type || "STOCK"] || "#64748b";

            return (
              <div
                key={t.id}
                className="flex items-center justify-between py-2"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Icon size={18} style={{ color }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t.ticker}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {new Date(t.purchase_date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>

                <span className="text-sm font-semibold text-[var(--color-positive)]">
                  +{formatBRL(t.total_value)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
