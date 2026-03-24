"use client";

import { useState } from "react";
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

function buildRvAportesGroups(data: MonthlyOverview): Group[] {
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

function buildRvResgatesGroups(data: MonthlyOverview): Group[] {
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

function buildRfAportesGroups(data: MonthlyOverview): Group[] {
  const groups: Group[] = [];

  if (data.fi_aportes.length > 0) {
    groups.push({
      key: "RF_APORTES",
      items: data.fi_aportes.map((fi) => ({
        label: fi.ticker || fi.description,
        amount: Number(fi.amount),
      })),
      subtotal: data.fi_aportes.reduce((sum, fi) => sum + Number(fi.amount), 0),
    });
  }

  if (data.fi_interest && data.fi_interest.length > 0) {
    groups.push({
      key: "RF_JUROS",
      items: data.fi_interest.map((fi) => ({
        label: fi.ticker || fi.description,
        amount: Number(fi.amount),
      })),
      subtotal: data.fi_interest.reduce((sum, fi) => sum + Number(fi.amount), 0),
    });
  }

  return groups;
}

function buildRfResgatesGroups(data: MonthlyOverview): Group[] {
  const groups: Group[] = [];

  if (data.fi_redemptions.length > 0) {
    groups.push({
      key: "RF_RESGATES",
      items: data.fi_redemptions.map((fi) => ({
        label: fi.ticker || fi.description,
        amount: Number(fi.amount),
      })),
      subtotal: data.fi_redemptions.reduce((sum, fi) => sum + Number(fi.amount), 0),
    });
  }

  return groups;
}

const rfGroupLabels: Record<string, string> = {
  RF_APORTES: "Aportes RF",
  RF_RESGATES: "Resgates RF",
  RF_JUROS: "Juros RF",
};

interface DetailDrawerProps {
  type: "aportes" | "resgates";
  data: MonthlyOverview;
}

export default function DetailDrawer({ type, data }: DetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"rv" | "rf">("rv");

  const rvGroups =
    type === "aportes" ? buildRvAportesGroups(data) : buildRvResgatesGroups(data);
  const rfGroups =
    type === "aportes" ? buildRfAportesGroups(data) : buildRfResgatesGroups(data);

  const hasRv = rvGroups.length > 0;
  const hasRf = rfGroups.length > 0;

  // If only one tab has data, show it directly without tabs
  if (!hasRv && !hasRf) {
    return (
      <div className="-mt-px overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-6 py-6">
        <p className="text-sm text-[var(--color-text-muted)] text-center">
          {type === "aportes"
            ? "Nenhum aporte neste periodo"
            : "Nenhum resgate neste periodo"}
        </p>
      </div>
    );
  }

  const groups = activeTab === "rv" ? rvGroups : rfGroups;
  const grandTotal = groups.reduce((sum, g) => sum + g.subtotal, 0);

  return (
    <div className="-mt-px overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
      {/* Tabs - only show if both have data */}
      {hasRv && hasRf && (
        <div className="px-4 md:px-8 pt-4 flex gap-1">
          <button
            onClick={() => setActiveTab("rv")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "rv"
                ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            Renda Variavel
          </button>
          <button
            onClick={() => setActiveTab("rf")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "rf"
                ? "bg-purple-500/15 text-purple-400"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            Renda Fixa
          </button>
        </div>
      )}

      <div className="px-4 md:px-8 pt-5 pb-5">
        {groups.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center">
            {type === "aportes"
              ? "Nenhum aporte neste periodo"
              : "Nenhum resgate neste periodo"}
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-6 md:gap-x-12 gap-y-5">
            {groups.map((group) => {
              const label =
                rfGroupLabels[group.key] || classLabels[group.key] || group.key;

              return (
                <div key={group.key} className="min-w-[180px]">
                  <div className="flex items-baseline justify-between gap-4 mb-2.5 pb-2 border-b border-[var(--color-border)]/50">
                    <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                      {label}
                    </span>
                    <span className="text-[13px] font-bold tabular-nums text-[var(--color-text-primary)]">
                      {formatBRL(group.subtotal)}
                    </span>
                  </div>

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
        )}
      </div>

      {groups.length > 0 && (
        <div className="px-4 md:px-8 py-3 border-t border-[var(--color-border)]/40 flex items-center justify-end gap-4">
          <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
            Total
          </span>
          <span className="text-sm font-bold tabular-nums text-[var(--color-text-primary)]">
            {formatBRL(grandTotal)}
          </span>
        </div>
      )}
    </div>
  );
}
