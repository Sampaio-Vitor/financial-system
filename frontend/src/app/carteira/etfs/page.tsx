"use client";

import { useState } from "react";
import AssetListPage from "@/components/asset-list-page";
import { Market } from "@/types";

type MarketFilter = "ALL" | Market;

const FILTERS: { value: MarketFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "BR", label: "Brasil" },
  { value: "US", label: "EUA" },
  { value: "EU", label: "Europa" },
  { value: "UK", label: "Reino Unido" },
];

export default function ETFsPage() {
  const [market, setMarket] = useState<MarketFilter>("ALL");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-[var(--color-bg-main)] rounded-lg p-1 w-fit">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setMarket(filter.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              market === filter.value
                ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <AssetListPage
        assetClass="ETF"
        market={market === "ALL" ? undefined : market}
        metadataMode="market_currency"
        title="ETFs"
        emptyMessage="Nenhuma posicao em ETFs para este filtro. Registre aportes para ver suas posicoes."
      />
    </div>
  );
}
