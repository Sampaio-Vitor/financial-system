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
      <div>
        <h1 className="text-xl font-bold mb-6">{title}</h1>
        <div className="animate-pulse h-96 rounded-xl bg-[var(--color-bg-card)]" />
      </div>
    );
  }

  if (!data || data.positions.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-6">{title}</h1>
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-muted)]">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const useNative = displayCurrency !== "BRL" && showToggle;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold">{title}</h1>
        {showToggle && nativeCurrency && (
          <div className="flex gap-1 bg-[var(--color-bg-main)] rounded-lg p-1">
            {(["BRL", nativeCurrency] as CurrencyCode[]).map((code) => (
              <button
                key={code}
                onClick={() => setDisplayCurrency(code)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
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
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
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
