"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { AssetClass, AssetType, Market, PositionsResponse } from "@/types";
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

  useEffect(() => {
    const params = new URLSearchParams();
    if (assetClass) params.set("asset_class", assetClass);
    if (market) params.set("market", market);
    const endpoint = assetType
      ? `/portfolio/${assetType}`
      : `/portfolio/positions?${params.toString()}`;

    apiFetch<PositionsResponse>(endpoint)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [assetType, assetClass, market]);

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

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">{title}</h1>
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
        <PositionsTable
          positions={data.positions}
          totalCost={data.total_cost}
          totalMarketValue={data.total_market_value}
          totalPnl={data.total_pnl}
          totalPnlPct={data.total_pnl_pct}
          metadataMode={metadataMode}
        />
      </div>
    </div>
  );
}
