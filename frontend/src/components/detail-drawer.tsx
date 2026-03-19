import { formatBRL } from "@/lib/format";
import { MonthlyOverview, AssetType, Purchase } from "@/types";

const classLabels: Record<string, string> = {
  STOCK: "Stocks (EUA)",
  ACAO: "Acoes (Brasil)",
  FII: "FIIs",
  RF: "Renda Fixa",
  RESERVA: "Reserva Financeira",
};

interface GroupItem {
  label: string;
  amount: number;
}

interface Group {
  key: string;
  items: GroupItem[];
  subtotal: number;
}

function buildAportesGroups(data: MonthlyOverview): Group[] {
  const groups: Group[] = [];

  const rvPurchases = data.transactions.filter((t) => Number(t.quantity) > 0);
  const byType: Record<string, Purchase[]> = {};
  for (const t of rvPurchases) {
    const type = t.asset_type || "STOCK";
    if (!byType[type]) byType[type] = [];
    byType[type].push(t);
  }

  const order: AssetType[] = ["STOCK", "ACAO", "FII"];
  for (const type of order) {
    const items = byType[type];
    if (!items || items.length === 0) continue;
    groups.push({
      key: type,
      items: items.map((t) => ({
        label: t.ticker || "—",
        amount: Number(t.total_value),
      })),
      subtotal: items.reduce((sum, t) => sum + Number(t.total_value), 0),
    });
  }

  if (data.fi_aportes.length > 0) {
    groups.push({
      key: "RF",
      items: data.fi_aportes.map((fi) => ({
        label: fi.ticker || fi.description,
        amount: Number(fi.amount),
      })),
      subtotal: data.fi_aportes.reduce((sum, fi) => sum + Number(fi.amount), 0),
    });
  }

  const depositos = Number(data.reserva_depositos);
  if (depositos > 0) {
    groups.push({
      key: "RESERVA",
      items: [{ label: "Aporte na reserva", amount: depositos }],
      subtotal: depositos,
    });
  }

  return groups;
}

function buildResgatesGroups(data: MonthlyOverview): Group[] {
  const groups: Group[] = [];

  const rvSales = data.transactions.filter((t) => Number(t.quantity) < 0);
  const byType: Record<string, Purchase[]> = {};
  for (const t of rvSales) {
    const type = t.asset_type || "STOCK";
    if (!byType[type]) byType[type] = [];
    byType[type].push(t);
  }

  const order: AssetType[] = ["STOCK", "ACAO", "FII"];
  for (const type of order) {
    const items = byType[type];
    if (!items || items.length === 0) continue;
    groups.push({
      key: type,
      items: items.map((t) => ({
        label: t.ticker || "—",
        amount: Math.abs(Number(t.total_value)),
      })),
      subtotal: items.reduce((sum, t) => sum + Math.abs(Number(t.total_value)), 0),
    });
  }

  if (data.fi_redemptions.length > 0) {
    groups.push({
      key: "RF",
      items: data.fi_redemptions.map((fi) => ({
        label: fi.ticker || fi.description,
        amount: Number(fi.amount),
      })),
      subtotal: data.fi_redemptions.reduce((sum, fi) => sum + Number(fi.amount), 0),
    });
  }

  const resgates = Number(data.reserva_resgates);
  if (resgates > 0) {
    groups.push({
      key: "RESERVA",
      items: [{ label: "Resgate da reserva", amount: resgates }],
      subtotal: resgates,
    });
  }

  return groups;
}

interface DetailDrawerProps {
  type: "aportes" | "resgates";
  data: MonthlyOverview;
}

export default function DetailDrawer({ type, data }: DetailDrawerProps) {
  const groups =
    type === "aportes" ? buildAportesGroups(data) : buildResgatesGroups(data);

  if (groups.length === 0) {
    return (
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] border-t-0 px-6 py-6 -mt-1">
        <p className="text-sm text-[var(--color-text-muted)] text-center">
          {type === "aportes"
            ? "Nenhum aporte neste periodo"
            : "Nenhum resgate neste periodo"}
        </p>
      </div>
    );
  }

  const grandTotal = groups.reduce((sum, g) => sum + g.subtotal, 0);

  return (
    <div className="bg-[var(--color-bg-card)] rounded-b-2xl border border-[var(--color-border)] border-t-0">
      <div className="px-8 pt-6 pb-5">
        <div className="flex flex-wrap gap-x-12 gap-y-5">
          {groups.map((group) => {
            const label = classLabels[group.key] || group.key;

            return (
              <div key={group.key} className="min-w-[180px]">
                {/* Group header */}
                <div className="flex items-baseline justify-between gap-4 mb-2.5 pb-2 border-b border-[var(--color-border)]/50">
                  <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                    {label}
                  </span>
                  <span className="text-[13px] font-bold tabular-nums text-[var(--color-text-primary)]">
                    {formatBRL(group.subtotal)}
                  </span>
                </div>

                {/* Items */}
                <div className="space-y-1">
                  {group.items.map((item, i) => (
                    <div
                      key={`${item.label}-${i}`}
                      className="flex items-center justify-between gap-6"
                    >
                      <span className="text-[13px] text-[var(--color-text-muted)]">
                        {item.label}
                      </span>
                      <span className="text-[13px] tabular-nums text-[var(--color-text-muted)]">
                        {formatBRL(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grand total */}
      <div className="px-8 py-3 border-t border-[var(--color-border)]/40 flex items-center justify-end gap-4">
        <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
          Total
        </span>
        <span className="text-sm font-bold tabular-nums text-[var(--color-text-primary)]">
          {formatBRL(grandTotal)}
        </span>
      </div>
    </div>
  );
}
