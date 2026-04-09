"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { formatBRL, formatCurrency } from "@/lib/format";
import { AllocationBucket, AssetClass, CurrencyCode, Market, SnapshotAssetItem } from "@/types";
import MobileCard from "@/components/mobile-card";
import TickerLogo from "@/components/ticker-logo";

const BUCKET_LABELS: Record<AllocationBucket, string> = {
  STOCK_BR: "Ações BR",
  STOCK_US: "Stocks",
  ETF_INTL: "ETFs Exterior",
  FII: "FIIs",
  RF: "Renda Fixa",
};

const BUCKET_COLORS: Record<AllocationBucket, string> = {
  STOCK_BR: "bg-emerald-500/20 text-emerald-400",
  STOCK_US: "bg-blue-500/20 text-blue-400",
  ETF_INTL: "bg-cyan-500/20 text-cyan-400",
  FII: "bg-amber-500/20 text-amber-400",
  RF: "bg-violet-500/20 text-violet-400",
};

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  STOCK: "Ação",
  ETF: "ETF",
  FII: "FII",
  RF: "Renda Fixa",
};

const MARKET_LABELS: Record<Market, string> = {
  BR: "Brasil",
  US: "EUA",
  EU: "Europa",
  UK: "Reino Unido",
};

const FALLBACK_TYPE_TO_BUCKET: Record<string, AllocationBucket> = {
  STOCK: "STOCK_US",
  ACAO: "STOCK_BR",
  FII: "FII",
  RF: "RF",
};

function getBucket(row: SnapshotAssetItem): AllocationBucket {
  return row.allocation_bucket || FALLBACK_TYPE_TO_BUCKET[row.type] || "RF";
}

function metaLabel(row: SnapshotAssetItem): string | null {
  if (!row.asset_class || !row.market || !row.quote_currency) return null;
  return `${ASSET_CLASS_LABELS[row.asset_class]} • ${MARKET_LABELS[row.market]} • ${row.quote_currency}`;
}

function closingLabel(row: SnapshotAssetItem): string {
  const currency = (row.quote_currency || "BRL") as CurrencyCode;
  if (row.closing_price_native != null && currency !== "BRL") {
    return `${formatCurrency(row.closing_price_native, currency)} (${formatBRL(row.closing_price)})`;
  }
  return row.closing_price != null ? formatBRL(row.closing_price) : "—";
}

export default function SnapshotAssetsTable({ month }: { month: string }) {
  const [data, setData] = useState<SnapshotAssetItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<SnapshotAssetItem[]>(`/snapshots/assets?month=${month}`)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [month]);

  if (loading) {
    return (
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4 tracking-tight">
          Fechamento por Ativo
        </h3>
        <div className="h-32 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4 tracking-tight">
          Fechamento por Ativo
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] text-center py-6">
          Sem dados para este mes. Gere os snapshots primeiro.
        </p>
      </div>
    );
  }

  const pnlColor = (val: number | null) => {
    const v = val ?? 0;
    return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-[var(--color-text-secondary)]";
  };

  return (
    <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 md:p-6 shadow-sm min-h-0 flex flex-col h-full">
      <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4 tracking-tight shrink-0">
        Fechamento por Ativo
      </h3>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2 flex-1 overflow-y-auto">
        {data.map((row) => (
          <MobileCard
            key={row.ticker}
            header={
              <div className="flex items-center gap-2">
                <TickerLogo
                  ticker={row.ticker}
                  type={row.type === "ACAO" ? "ACAO" : row.type === "STOCK" ? "STOCK" : undefined}
                  assetClass={row.asset_class}
                  market={row.market}
                  size={22}
                />
                <div>
                  <span className="font-medium text-sm text-[var(--color-text-primary)]">
                    {row.ticker}
                  </span>
                  {metaLabel(row) && (
                    <div className="text-[10px] text-[var(--color-text-muted)]">{metaLabel(row)}</div>
                  )}
                </div>
              </div>
            }
            badge={
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BUCKET_COLORS[getBucket(row)] || ""}`}>
                {BUCKET_LABELS[getBucket(row)]}
              </span>
            }
            bodyItems={[
              { label: "Valor", value: row.market_value != null ? formatBRL(row.market_value) : "\u2014" },
              { label: "Qtd", value: row.type === "RF" ? "\u2014" : row.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) },
            ]}
            expandedItems={[
              { label: "Preco Medio", value: formatBRL(row.avg_price) },
              { label: "Fechamento", value: closingLabel(row) },
              {
                label: "FX para BRL",
                value: row.quote_currency && row.quote_currency !== "BRL" ? formatBRL(row.fx_rate_to_brl) : formatBRL(1),
              },
              {
                label: "PnL (%)",
                value: <span className={pnlColor(row.pnl_pct)}>{row.pnl_pct != null ? `${row.pnl_pct >= 0 ? "+" : ""}${row.pnl_pct.toFixed(2)}%` : "\u2014"}</span>,
              },
              {
                label: "PnL (R$)",
                value: (
                  <span className={pnlColor(row.pnl)}>
                    {row.pnl != null ? formatBRL(row.pnl) : "\u2014"}
                  </span>
                ),
              },
            ]}
          />
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Ativo
              </th>
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Tipo
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Qtd
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Preco Medio
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Fechamento
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Valor
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                PnL
              </th>
              <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                PnL %
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const pnl = row.pnl ?? 0;
              const color = pnlColor(pnl);

              return (
                <tr
                  key={row.ticker}
                  className="border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-bg-main)]/50 transition-colors"
                >
                  <td className="py-2.5 px-3 font-medium text-[var(--color-text-primary)]">
                    <div className="flex items-center gap-2">
                      <TickerLogo
                        ticker={row.ticker}
                        type={row.type === "ACAO" ? "ACAO" : row.type === "STOCK" ? "STOCK" : undefined}
                        assetClass={row.asset_class}
                        market={row.market}
                        size={22}
                      />
                      <div>
                        <div>{row.ticker}</div>
                        {metaLabel(row) && (
                          <div className="text-[10px] font-normal text-[var(--color-text-muted)]">
                            {metaLabel(row)}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BUCKET_COLORS[getBucket(row)] || ""}`}>
                      {BUCKET_LABELS[getBucket(row)]}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-[var(--color-text-secondary)] tabular-nums">
                    {row.type === "RF" ? "\u2014" : row.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[var(--color-text-secondary)] tabular-nums">
                    {formatBRL(row.avg_price)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[var(--color-text-secondary)] tabular-nums">
                    {closingLabel(row)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[var(--color-text-secondary)] tabular-nums">
                    {row.market_value != null ? formatBRL(row.market_value) : "\u2014"}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${color}`}>
                    {row.pnl != null ? formatBRL(row.pnl) : "\u2014"}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${color}`}>
                    {row.pnl_pct != null
                      ? `${row.pnl_pct >= 0 ? "+" : ""}${row.pnl_pct.toFixed(2)}%`
                      : "\u2014"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
