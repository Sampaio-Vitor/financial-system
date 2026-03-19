"use client";

import { useState } from "react";
import { AssetType } from "@/types";

function getLogoUrl(ticker: string, type: AssetType): string | null {
  if (type === "STOCK") {
    return `https://api.elbstream.com/logos/symbol/${ticker}?format=png&size=128`;
  }
  if (type === "ACAO") {
    return `https://api.elbstream.com/logos/symbol/${ticker}.SA?format=png&size=128`;
  }
  return null;
}

interface TickerLogoProps {
  ticker: string;
  type: AssetType;
  size?: number;
}

export default function TickerLogo({ ticker, type, size = 24 }: TickerLogoProps) {
  const [failed, setFailed] = useState(false);
  const url = getLogoUrl(ticker, type);

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
