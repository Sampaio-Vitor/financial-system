"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PriceUpdateResult } from "@/types";

export default function PriceUpdateButton({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PriceUpdateResult | null>(null);

  const handleUpdate = async () => {
    setLoading(true);
    setResult(null);

    try {
      const data = await apiFetch<PriceUpdateResult>("/prices/update", {
        method: "POST",
      });
      setResult(data);
      onComplete?.();
    } catch (err) {
      setResult({
        updated: [],
        failed: [{ ticker: "ALL", error: err instanceof Error ? err.message : "Failed" }],
        usd_brl_rate: null,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleUpdate}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        {loading ? "Atualizando..." : "Atualizar Cotacoes"}
      </button>

      {result && (
        <div className="mt-2 text-xs text-[var(--color-text-muted)]">
          {result.updated.length > 0 && (
            <span className="text-[var(--color-positive)]">
              {result.updated.length} atualizados
            </span>
          )}
          {result.failed.length > 0 && (
            <span className="text-[var(--color-negative)] ml-2">
              {result.failed.length} falharam
            </span>
          )}
        </div>
      )}
    </div>
  );
}
