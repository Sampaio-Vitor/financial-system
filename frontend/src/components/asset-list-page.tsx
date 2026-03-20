"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { AssetType, PositionsResponse } from "@/types";
import PositionsTable from "@/components/positions-table";

interface AssetListPageProps {
  assetType: AssetType;
  title: string;
  emptyMessage: string;
}

export default function AssetListPage({ assetType, title, emptyMessage }: AssetListPageProps) {
  const [data, setData] = useState<PositionsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<PositionsResponse>(`/portfolio/${assetType}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [assetType]);

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
        />
      </div>
    </div>
  );
}
