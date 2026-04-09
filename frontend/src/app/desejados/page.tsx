"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { AllocationBucket, AllocationTarget, CurrencyCode, RebalancingResponse } from "@/types";
import { formatBRL, formatCurrency } from "@/lib/format";
import { Calculator, Info, ShieldCheck, Save, FolderOpen, FileText } from "lucide-react";
import TickerLogo from "@/components/ticker-logo";
import CalculationMemoryModal from "@/components/calculation-memory-modal";
import Link from "next/link";

const CLASS_COLORS: Record<AllocationBucket, string> = {
  STOCK_BR: "#10b981",
  STOCK_US: "#3b82f6",
  ETF_INTL: "#0ea5e9",
  FII: "#f59e0b",
  RF: "#8b5cf6",
};

const BUCKET_LABELS: Record<AllocationBucket, string> = {
  STOCK_BR: "Ações (Brasil)",
  STOCK_US: "Stocks",
  ETF_INTL: "ETFs (Exterior)",
  FII: "FIIs",
  RF: "Renda Fixa",
};

export default function PlanejadorAportePage() {
  const [targets, setTargets] = useState<AllocationTarget[]>([]);
  const [contribution, setContribution] = useState("50.000,00");
  const [topN, setTopN] = useState("10");
  const [rebalancing, setRebalancing] = useState<RebalancingResponse | null>(
    null
  );

  const [saving, setSaving] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);

  const hasTargets = targets.length > 0;
  const reserveGap = Number(rebalancing?.reserva_gap ?? 0);
  const contributionValue = Number(rebalancing?.contribution ?? 0);
  const reserveAllocation =
    reserveGap > 0 ? Math.min(reserveGap, contributionValue) : 0;
  const reserveConsumesAllContribution = reserveGap >= contributionValue;
  const reserveShortfallAfterContribution = Math.max(
    reserveGap - contributionValue,
    0
  );
  const remainingForInvestments = Math.max(
    contributionValue - reserveAllocation,
    0
  );
  const projectedReserveValue =
    Number(rebalancing?.reserva_valor ?? 0) + reserveAllocation;
  const projectedReserveProgress =
    rebalancing?.reserva_target && Number(rebalancing.reserva_target) > 0
      ? Math.min(
          (projectedReserveValue / Number(rebalancing.reserva_target)) * 100,
          100
        )
      : 0;
  const plannedInvestmentsByClass = rebalancing?.asset_plan.reduce(
    (acc, asset) => {
      acc[asset.allocation_bucket] =
        (acc[asset.allocation_bucket] ?? 0) + Number(asset.amount_to_invest);
      return acc;
    },
    {
      STOCK_BR: 0,
      STOCK_US: 0,
      ETF_INTL: 0,
      FII: 0,
      RF: 0,
    } as Record<AllocationBucket, number>
  ) ?? {
    STOCK_BR: 0,
    STOCK_US: 0,
    ETF_INTL: 0,
    FII: 0,
    RF: 0,
  };
  const plannedNativeTotals = rebalancing?.asset_plan.reduce(
    (acc, asset) => {
      const currency = asset.quote_currency ?? "BRL";
      const nativeAmount =
        currency === "BRL"
          ? Number(asset.amount_to_invest)
          : asset.amount_to_invest_native != null
            ? Number(asset.amount_to_invest_native)
            : 0;
      if (nativeAmount > 0) {
        acc[currency] = (acc[currency] ?? 0) + nativeAmount;
      }
      return acc;
    },
    {} as Partial<Record<CurrencyCode, number>>
  ) ?? {};
  const projectedInvestableTotal = rebalancing
    ? rebalancing.class_breakdown.reduce(
        (total, item) => total + Number(item.current_value),
        0
      ) + Number(rebalancing.total_planned ?? 0)
    : 0;
  const projectedClassBreakdown = rebalancing?.class_breakdown.map((item) => {
    const currentValue = Number(item.current_value);
    const targetPct = Number(item.target_pct);
    const targetValue = Number(item.target_value);
    const currentPct = Number(item.current_pct);
    const plannedAmount = plannedInvestmentsByClass[item.allocation_bucket] ?? 0;
    const projectedValue = currentValue + plannedAmount;
    const projectedPct =
      projectedInvestableTotal > 0
        ? (projectedValue / projectedInvestableTotal) * 100
        : 0;
    const deltaToTarget = projectedValue - targetValue;

    return {
      ...item,
      currentValue,
      targetPct,
      targetValue,
      currentPct,
      plannedAmount,
      projectedValue,
      projectedPct,
      deltaToTarget,
    };
  }) ?? [];

  const fetchTargets = useCallback(async () => {
    try {
      const data = await apiFetch<AllocationTarget[]>("/allocation-targets");
      setTargets(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  const parseBRL = (v: string) =>
    Number(v.replace(/\./g, "").replace(",", ".")) || 0;

  const formatInputBRL = (v: string) => {
    const digits = v.replace(/\D/g, "");
    if (!digits) return "";
    const num = Number(digits) / 100;
    return num.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleCalculate = async () => {
    try {
      const raw = parseBRL(contribution);
      const data = await apiFetch<RebalancingResponse>(
        `/rebalancing?contribution=${raw}&top_n=${topN}`
      );
      setRebalancing(data);
      setMemoryOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao calcular");
    }
  };

  const handleSave = async () => {
    if (!rebalancing) return;
    setSaving(true);
    try {
      const now = new Date();
      const label = `Plano ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

      const items: {
        ticker: string;
        asset_class: string;
        current_value: number;
        target_value: number;
        gap: number;
        amount_to_invest: number;
        amount_to_invest_usd: number | null;
        amount_to_invest_native: number | null;
        quote_currency: CurrencyCode | null;
        is_reserve: boolean;
      }[] = [];

      // Add reserve as item if applicable
      if (rebalancing.reserva_gap != null && Number(rebalancing.reserva_gap) > 0) {
        items.push({
          ticker: "RESERVA",
          asset_class: "RESERVA",
          current_value: Number(rebalancing.reserva_valor),
          target_value: Number(rebalancing.reserva_target ?? 0),
          gap: Number(rebalancing.reserva_gap),
          amount_to_invest: reserveAllocation,
          amount_to_invest_usd: null,
          amount_to_invest_native: null,
          quote_currency: null,
          is_reserve: true,
        });
      }

      for (const a of rebalancing.asset_plan) {
        items.push({
          ticker: a.ticker,
          asset_class: a.allocation_bucket,
          current_value: Number(a.current_value),
          target_value: Number(a.target_value),
          gap: Number(a.gap),
          amount_to_invest: Number(a.amount_to_invest),
          amount_to_invest_usd:
            a.amount_to_invest_usd != null
              ? Number(a.amount_to_invest_usd)
              : null,
          amount_to_invest_native:
            a.amount_to_invest_native != null
              ? Number(a.amount_to_invest_native)
              : null,
          quote_currency: a.quote_currency,
          is_reserve: false,
        });
      }

      await apiFetch("/saved-plans", {
        method: "POST",
        body: JSON.stringify({
          label,
          contribution: Number(rebalancing.contribution),
          patrimonio_atual: Number(rebalancing.patrimonio_atual),
          patrimonio_pos_aporte: Number(rebalancing.patrimonio_pos_aporte),
          reserva_valor: Number(rebalancing.reserva_valor),
          reserva_target:
            rebalancing.reserva_target != null
              ? Number(rebalancing.reserva_target)
              : null,
          reserva_gap:
            rebalancing.reserva_gap != null
              ? Number(rebalancing.reserva_gap)
              : null,
          total_planned:
            Number(rebalancing.total_planned || 0) + reserveAllocation,
          class_breakdown_json: JSON.stringify(rebalancing.class_breakdown),
          items,
        }),
      });
      toast.success("Recomendação salva!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Planejador de Aporte</h1>
        <Link
          href="/desejados/salvos"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition-colors"
        >
          <FolderOpen size={16} /> Planejamentos Salvos
        </Link>
      </div>

      {/* Banner: no targets configured */}
      {!hasTargets && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-[var(--color-accent)]/20 flex items-center justify-center">
            <Info size={20} className="text-[var(--color-accent)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-accent)]">
              Nenhuma meta de alocação configurada
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Configure suas metas no{" "}
              <Link
                href="/carteira/catalogo?tab=metas"
                className="text-[var(--color-accent)] underline hover:opacity-80"
              >
                Catálogo
              </Link>{" "}
              para utilizar o planejador de aporte.
            </p>
          </div>
        </div>
      )}

      {/* Rebalancing Plan */}
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-4">
          Plano de Aporte
        </h2>
        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">
              Aporte deste mês (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-sm">
                R$
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={contribution}
                onChange={(e) => setContribution(formatInputBRL(e.target.value))}
                className="w-full md:w-48 pl-10 pr-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">
              Qtd ativos a aportar
            </label>
            <input
              type="number"
              value={topN}
              onChange={(e) => setTopN(e.target.value)}
              className="w-full md:w-24 px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCalculate}
              disabled={!hasTargets}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-positive)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Calculator size={16} /> Calcular
            </button>
          </div>
        </div>

        {rebalancing && (
          <div className="space-y-4">
            <div className="text-xs text-[var(--color-text-muted)]">
              Patrimônio Atual: {formatBRL(rebalancing.patrimonio_atual)} |
              Pós-Aporte: {formatBRL(rebalancing.patrimonio_pos_aporte)}
            </div>

            {/* Reserve priority alert */}
            {rebalancing.reserva_gap != null &&
              rebalancing.reserva_gap > 0 && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                    <span className="text-cyan-400 text-lg font-bold">!</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-cyan-400">
                      Reserva Financeira (Prioridade)
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      Atual: {formatBRL(rebalancing.reserva_valor)} | Meta:{" "}
                      {formatBRL(rebalancing.reserva_target!)} | Aportar na
                      reserva:{" "}
                      <span className="font-bold text-cyan-400">
                        {formatBRL(reserveAllocation)}
                      </span>
                    </p>
                    {reserveConsumesAllContribution ? (
                      <p className="text-xs text-[var(--color-warning)] mt-1">
                        Todo o aporte vai para a reserva. Faltam{" "}
                        {formatBRL(reserveShortfallAfterContribution)}{" "}
                        após este aporte.
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        Restante para investimentos:{" "}
                        {formatBRL(remainingForInvestments)}
                      </p>
                    )}
                  </div>
                </div>
              )}

            {rebalancing.reserva_target != null &&
              rebalancing.reserva_gap != null &&
              rebalancing.reserva_gap <= 0 && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-positive)]/10 border border-[var(--color-positive)]/20">
                  <p className="text-xs text-[var(--color-positive)] font-medium">
                    Reserva completa ({formatBRL(rebalancing.reserva_valor)} /{" "}
                    {formatBRL(rebalancing.reserva_target)}) — todo o aporte vai
                    para investimentos.
                  </p>
                </div>
              )}

            {projectedClassBreakdown.length > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)]/30 p-4 md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">
                      Balanço Pós-Aporte
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs text-[var(--color-text-muted)] md:grid-cols-3">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2">
                      <span className="block">Investível Pós-Aporte</span>
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {formatBRL(projectedInvestableTotal)}
                      </span>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2">
                      <span className="block">Reserva Pós-Aporte</span>
                      <span className="text-sm font-semibold text-cyan-400">
                        {formatBRL(projectedReserveValue)}
                      </span>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2">
                      <span className="block">Patrimônio Pós-Aporte</span>
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {formatBRL(rebalancing.patrimonio_pos_aporte)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {projectedClassBreakdown.map((item) => (
                    <div key={item.allocation_bucket}>
                      <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor: CLASS_COLORS[item.allocation_bucket],
                            }}
                          />
                          <span className="text-sm font-medium">
                            {item.label}
                          </span>
                        </div>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {item.projectedPct.toFixed(1)}% / {item.targetPct.toFixed(1)}%
                        </span>
                      </div>

                      <div className="relative h-2 rounded-full bg-[var(--color-border)]/40">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full transition-all"
                          style={{
                            width: `${Math.min(item.projectedPct, 100)}%`,
                            backgroundColor: CLASS_COLORS[item.allocation_bucket],
                          }}
                        />
                        <div
                          className="absolute -top-1 -bottom-1 w-[2px] rounded-full"
                          style={{
                            left: `${Math.min(item.targetPct, 100)}%`,
                            backgroundColor: "var(--color-text-secondary)",
                          }}
                          title={`Meta ${item.targetPct.toFixed(1)}%`}
                        />
                      </div>

                    </div>
                  ))}

                  <div className="border-t border-[var(--color-border)]/60 pt-4">
                    <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: "#06b6d4" }}
                        />
                        <span className="text-sm font-medium">
                          Reserva Financeira
                        </span>
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {projectedReserveProgress.toFixed(1)}% da meta
                      </span>
                    </div>

                    <div className="relative h-2 rounded-full bg-[var(--color-border)]/40">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all"
                        style={{
                          width: `${projectedReserveProgress}%`,
                          backgroundColor: "#06b6d4",
                        }}
                      />
                    </div>

                  </div>
                </div>
              </div>
            )}


            {/* Asset plan */}
            {(rebalancing.asset_plan.length > 0 ||
              (rebalancing.reserva_gap != null &&
                rebalancing.reserva_gap > 0)) && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)]/30 p-4 md:p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">
                    Plano por Ativo (Top {topN})
                  </h3>
                  <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
                    {Object.entries(plannedNativeTotals).map(([currency, total]) => (
                      <div key={currency} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2">
                        <span className="block">Aportar em {currency}</span>
                        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {formatCurrency(total, currency as CurrencyCode)}
                        </span>
                      </div>
                    ))}
                    {reserveAllocation > 0 && (
                      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2">
                        <span className="block">Reserva no Plano</span>
                        <span className="text-sm font-semibold text-cyan-400">
                          {formatBRL(reserveAllocation)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                        Ticker
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                        Classe
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                        Valor Atual
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                        Valor Alvo
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                        Gap
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                        Após Aporte
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                        Aportar (R$)
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                        Aportar (Moeda do Ativo)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Reserve row (priority) */}
                    {rebalancing.reserva_gap != null &&
                      rebalancing.reserva_gap > 0 && (
                        <tr className="border-b-2 border-cyan-500/30 bg-cyan-500/5">
                          <td className="px-3 py-2 font-medium">
                            <div className="flex items-center gap-2 text-cyan-400">
                              <ShieldCheck size={20} />
                              Reserva Financeira
                            </div>
                          </td>
                          <td className="px-3 py-2 text-cyan-400 text-xs font-semibold">
                            PRIORIDADE
                          </td>
                          <td className="px-3 py-2">
                            {formatBRL(rebalancing.reserva_valor)}
                          </td>
                          <td className="px-3 py-2">
                            {rebalancing.reserva_target != null
                              ? formatBRL(rebalancing.reserva_target)
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-cyan-400">
                            {formatBRL(rebalancing.reserva_gap)}
                          </td>
                          <td className="px-3 py-2">
                            {formatBRL(projectedReserveValue)}
                          </td>
                          <td className="px-3 py-2 font-bold text-cyan-400">
                            {formatBRL(reserveAllocation)}
                          </td>
                          <td className="px-3 py-2 text-[var(--color-text-muted)]">
                            —
                          </td>
                        </tr>
                      )}
                    {rebalancing.asset_plan.map((a) => (
                      <tr
                        key={a.ticker}
                        className="border-b border-[var(--color-border)]/50"
                      >
                        <td className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-2">
                            <TickerLogo
                              ticker={a.ticker}
                              type={a.asset_class === "STOCK" && a.market === "BR" ? "ACAO" : a.asset_class === "STOCK" ? "STOCK" : undefined}
                              assetClass={a.asset_class}
                              market={a.market}
                              size={20}
                            />
                            {a.ticker}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                          {BUCKET_LABELS[a.allocation_bucket]}
                        </td>
                        <td className="px-3 py-2">
                          {formatBRL(a.current_value)}
                        </td>
                        <td className="px-3 py-2">
                          {formatBRL(a.target_value)}
                        </td>
                        <td className="px-3 py-2 text-[var(--color-positive)]">
                          {formatBRL(a.gap)}
                        </td>
                        <td className="px-3 py-2">
                          {formatBRL(
                            Number(a.current_value) + Number(a.amount_to_invest)
                          )}
                        </td>
                        <td className="px-3 py-2 font-bold">
                          {formatBRL(a.amount_to_invest)}
                        </td>
                        <td className="px-3 py-2 text-[var(--color-text-muted)]">
                          {a.amount_to_invest_native != null && a.quote_currency !== "BRL"
                            ? formatCurrency(a.amount_to_invest_native, a.quote_currency)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--color-border)] font-bold">
                      <td className="px-3 py-2" colSpan={6}>
                        TOTAL PLANEJADO
                      </td>
                      <td className="px-3 py-2">
                        {formatBRL(
                          Number(rebalancing.total_planned || 0) +
                            (rebalancing.reserva_gap != null && reserveGap > 0
                              ? reserveAllocation
                              : 0)
                        )}
                      </td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
              </div>
            )}

            {/* Save button */}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                onClick={() => setMemoryOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-main)] transition-colors"
              >
                <FileText size={16} /> Memória de Cálculo
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Save size={16} /> {saving ? "Salvando..." : "Salvar Recomendação"}
              </button>
            </div>
          </div>
        )}
      </div>

      <CalculationMemoryModal
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        rebalancing={rebalancing}
        reserveAllocation={reserveAllocation}
        remainingForInvestments={remainingForInvestments}
        topN={Number(topN) || 0}
      />
    </div>
  );
}
