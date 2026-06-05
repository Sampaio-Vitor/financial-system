"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { MoverItem, MoverPeriod, MoversResponse } from "@/types";

type SegmentKey = "ALL" | "STOCK_BR" | "STOCK_US" | "FII" | "CRYPTO" | "RF";

const BACKFILL_ATTEMPT_KEY = "movers-backfill-attempted-v1";

const PERIODS: { key: MoverPeriod; label: string }[] = [
  { key: "day", label: "Dia" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
  { key: "year", label: "Ano" },
];

const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: "ALL", label: "Tudo" },
  { key: "STOCK_BR", label: "Ações BR" },
  { key: "STOCK_US", label: "Stocks US" },
  { key: "FII", label: "FIIs" },
  { key: "CRYPTO", label: "Crypto" },
  { key: "RF", label: "RF" },
];

function segmentToParams(seg: SegmentKey): {
  asset_class?: string;
  market?: string;
  include_rf: boolean;
} {
  switch (seg) {
    case "STOCK_BR":
      return { asset_class: "STOCK", market: "BR", include_rf: false };
    case "STOCK_US":
      return { asset_class: "STOCK", market: "US", include_rf: false };
    case "FII":
      return { asset_class: "FII", include_rf: false };
    case "CRYPTO":
      return { asset_class: "CRYPTO", market: "CRYPTO", include_rf: false };
    case "RF":
      return { asset_class: "RF", include_rf: true };
    default:
      return { include_rf: false };
  }
}

function formatPct(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

function MoverRow({
  item,
  maxAbsImpact,
}: {
  item: MoverItem;
  maxAbsImpact: number;
}) {
  const positive = item.pnl_period_brl >= 0;
  const color = positive
    ? "var(--color-positive)"
    : "var(--color-negative)";
  const widthPct =
    maxAbsImpact > 0
      ? Math.min(100, (Math.abs(item.pnl_period_brl) / maxAbsImpact) * 100)
      : 0;

  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-[var(--color-text-primary)] truncate">
            {item.ticker}
          </p>
          {item.description && (
            <p className="text-[11px] text-[var(--color-text-muted)] truncate">
              {item.description}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm font-bold" style={{ color }}>
            {formatPct(item.pnl_period_pct)}
          </p>
          <p className="text-[11px]" style={{ color }}>
            {positive ? "+" : ""}
            {formatBRL(item.pnl_period_brl)}
          </p>
        </div>
      </div>
      <div className="mt-2 h-1 bg-[var(--color-bg-hover)] rounded">
        <div
          className="h-1 rounded"
          style={{ width: `${widthPct}%`, backgroundColor: color }}
        />
      </div>
      {(item.net_contributions_brl !== 0 || item.dividends_brl !== 0) && (
        <div className="mt-1.5 flex gap-3 text-[10px] text-[var(--color-text-muted)]">
          {item.net_contributions_brl !== 0 && (
            <span>Aportes: {formatBRL(item.net_contributions_brl)}</span>
          )}
          {item.dividends_brl !== 0 && (
            <span>Dividendos: {formatBRL(item.dividends_brl)}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function MoversTab() {
  const [period, setPeriod] = useState<MoverPeriod>("day");
  const [segment, setSegment] = useState<SegmentKey>("ALL");
  const [data, setData] = useState<MoversResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoBackfillStarted = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = segmentToParams(segment);
      const qs = new URLSearchParams({
        period,
        limit: "10",
        include_rf: String(params.include_rf),
      });
      if (params.asset_class) qs.set("asset_class", params.asset_class);
      if (params.market) qs.set("market", params.market);
      const res = await apiFetch<MoversResponse>(
        `/snapshots/movers?${qs.toString()}`,
      );
      setData(res);
    } catch {
      setError("Falha ao carregar movers.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, segment]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runBackfill = useCallback(async () => {
    setBackfilling(true);
    setBackfillError(null);
    try {
      await apiFetch("/snapshots/backfill-asset-snapshots?months=6", {
        method: "POST",
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(BACKFILL_ATTEMPT_KEY, "done");
      }
      await fetchData();
    } catch {
      setBackfillError("Falha ao gerar o histórico dos ativos.");
    } finally {
      setBackfilling(false);
    }
  }, [fetchData]);

  useEffect(() => {
    if (
      loading ||
      error ||
      backfilling ||
      segment !== "ALL" ||
      !data ||
      data.winners.length > 0 ||
      data.losers.length > 0 ||
      autoBackfillStarted.current
    ) {
      return;
    }

    const alreadyAttempted =
      typeof window !== "undefined" &&
      window.localStorage.getItem(BACKFILL_ATTEMPT_KEY) === "done";
    if (alreadyAttempted) return;

    autoBackfillStarted.current = true;
    runBackfill();
  }, [backfilling, data, error, loading, runBackfill, segment]);

  const maxAbsImpact = data
    ? Math.max(
        0,
        ...data.winners.map((w) => Math.abs(w.pnl_period_brl)),
        ...data.losers.map((l) => Math.abs(l.pnl_period_brl)),
      )
    : 0;

  return (
    <div className="space-y-5">
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-1 mb-3">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                period === p.key
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSegment(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                segment === s.key
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {data && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Movimento líquido do período
            </p>
            <p
              className="text-lg font-bold"
              style={{
                color:
                  data.total_period_pnl >= 0
                    ? "var(--color-positive)"
                    : "var(--color-negative)",
              }}
            >
              {data.total_period_pnl >= 0 ? "+" : ""}
              {formatBRL(data.total_period_pnl)}
            </p>
          </div>
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Janela
            </p>
            <p className="text-sm font-bold text-[var(--color-text-primary)]">
              {formatDate(data.period_start_date)} →{" "}
              {formatDate(data.reference_date)}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-muted)] animate-pulse">
            Carregando...
          </p>
        </div>
      ) : error ? (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6">
          <p className="text-sm text-[var(--color-negative)]">{error}</p>
        </div>
      ) : backfilling ? (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-muted)] animate-pulse">
            Gerando histórico dos ativos...
          </p>
        </div>
      ) : data && data.winners.length === 0 && data.losers.length === 0 ? (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-muted)] font-medium">
            Sem movimentação no período.
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Os snapshots por ativo são gerados todos os dias as 18h (BRT).
          </p>
          {backfillError && (
            <p className="text-xs text-[var(--color-negative)] mt-3">
              {backfillError}
            </p>
          )}
          <button
            onClick={runBackfill}
            disabled={backfilling}
            className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Gerar histórico dos últimos 6 meses
          </button>
        </div>
      ) : (
        data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
                Melhores performances
              </h3>
              {data.winners.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] py-6 text-center">
                  Nenhum ativo positivo no período.
                </p>
              ) : (
                <div>
                  {data.winners.map((it) => (
                    <MoverRow
                      key={it.asset_id}
                      item={it}
                      maxAbsImpact={maxAbsImpact}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
                Maiores ofensores
              </h3>
              {data.losers.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] py-6 text-center">
                  Nenhum ativo negativo no período.
                </p>
              ) : (
                <div>
                  {data.losers.map((it) => (
                    <MoverRow
                      key={it.asset_id}
                      item={it}
                      maxAbsImpact={maxAbsImpact}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
