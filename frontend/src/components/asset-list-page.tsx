"use client";

import { useCallback, useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { AssetClass, AssetType, CurrencyCode, Market, PositionsResponse } from "@/types";
import PositionsTable from "@/components/positions-table";

interface AssetListPageProps {
  assetType?: AssetType;
  assetClass?: AssetClass;
  market?: Market;
  metadataMode?: "none" | "market_currency";
  title: string;
  emptyMessage: string;
}

export default function AssetListPage({
  assetType,
  assetClass,
  market,
  metadataMode = "none",
  title,
  emptyMessage,
}: AssetListPageProps) {
  const [data, setData] = useState<PositionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("BRL");

  const fetchPositions = useCallback((showLoading = true) => {
    if (showLoading) setLoading(true);
    const params = new URLSearchParams();
    if (assetClass) params.set("asset_class", assetClass);
    if (market) params.set("market", market);
    const endpoint = assetType
      ? `/portfolio/${assetType}`
      : `/portfolio/positions?${params.toString()}`;

    return apiFetch<PositionsResponse>(endpoint)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => {
        if (showLoading) setLoading(false);
      });
  }, [assetType, assetClass, market]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const refreshPositionsSilently = useCallback(() => {
    void fetchPositions(false);
  }, [fetchPositions]);

  const nativeCurrency = data?.native_currency ?? null;
  const showToggle = !!nativeCurrency && nativeCurrency !== "BRL";

  useEffect(() => {
    if (!showToggle && displayCurrency !== "BRL") {
      setDisplayCurrency("BRL");
    }
  }, [showToggle, displayCurrency]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold md:text-2xl">{title}</h1>
        <div className="h-96 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]" />
      </div>
    );
  }

  if (!data || data.positions.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold md:text-2xl">{title}</h1>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 text-center md:p-8">
          <p className="text-[var(--color-text-muted)]">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const useNative = displayCurrency !== "BRL" && showToggle;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">{title}</h1>
          <p className="mt-1 text-xs text-[var(--color-text-muted)] md:hidden">
            {data.positions.length} ativos na carteira
          </p>
        </div>
        {showToggle && nativeCurrency && (
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 sm:flex sm:bg-[var(--color-bg-main)]">
            {(["BRL", nativeCurrency] as CurrencyCode[]).map((code) => (
              <button
                key={code}
                onClick={() => setDisplayCurrency(code)}
                className={`min-h-9 rounded-md px-4 py-1.5 text-xs font-medium transition-all ${
                  displayCurrency === code
                    ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="md:rounded-xl md:border md:border-[var(--color-border)] md:bg-[var(--color-bg-card)] md:p-4">
        <PositionsTable
          positions={data.positions}
          totalCost={useNative ? data.total_cost_native ?? 0 : data.total_cost}
          totalMarketValue={
            useNative ? data.total_market_value_native ?? 0 : data.total_market_value
          }
          totalPnl={useNative ? data.total_pnl_native ?? 0 : data.total_pnl}
          totalPnlPct={useNative ? data.total_pnl_pct_native ?? null : data.total_pnl_pct}
          metadataMode={metadataMode}
          displayCurrency={useNative ? nativeCurrency! : "BRL"}
          onRefresh={refreshPositionsSilently}
        />
      </div>
    </div>
  );
}
