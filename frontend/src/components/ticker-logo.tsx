"use client";

import { useState } from "react";
import { AssetClass, AssetType, Market } from "@/types";

function getLogoUrl(
  ticker: string,
  type?: AssetType | null,
  assetClass?: AssetClass | null,
  market?: Market | null
): string | null {
  if (market === "BR" || type === "ACAO" || type === "FII") {
    const base = ticker.endsWith(".SA") ? ticker.slice(0, -3) : ticker;
    return `https://api.elbstream.com/logos/symbol/${base}.SA?format=png&size=128`;
  }
  if (market === "UK") {
    const base = ticker.endsWith(".L") ? ticker.slice(0, -2) : ticker;
    return `https://api.elbstream.com/logos/symbol/${base}.L?format=png&size=128`;
  }
  if (market === "US" || market === "EU" || type === "STOCK" || assetClass === "ETF") {
    return `https://api.elbstream.com/logos/symbol/${ticker}?format=png&size=128`;
  }
  return null;
}

interface TickerLogoProps {
  ticker: string;
  type?: AssetType | null;
  assetClass?: AssetClass | null;
  market?: Market | null;
  size?: number;
}

export default function TickerLogo({
  ticker,
  type,
  assetClass,
  market,
  size = 24,
}: TickerLogoProps) {
  const [failed, setFailed] = useState(false);
  const url = getLogoUrl(ticker, type, assetClass, market);

  if (!url || failed) {
    // Fallback: initials circle
    return (
      <div
        className="shrink-0 rounded-full bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-[var(--color-text-muted)] font-semibold" style={{ fontSize: size * 0.4 }}>
          {ticker.slice(0, 2)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={ticker}
      width={size}
      height={size}
      className="shrink-0 rounded-full bg-[var(--color-bg-main)]"
      onError={() => setFailed(true)}
    />
  );
}
