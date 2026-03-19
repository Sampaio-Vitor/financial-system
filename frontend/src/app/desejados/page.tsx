"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { AllocationTarget, AssetType, RebalancingResponse } from "@/types";
import { formatBRL, formatUSD, formatPercent } from "@/lib/format";
import { Calculator, Info, ShieldCheck } from "lucide-react";
import TickerLogo from "@/components/ticker-logo";
import Link from "next/link";

export default function PlanejadorAportePage() {
  const [targets, setTargets] = useState<AllocationTarget[]>([]);
  const [contribution, setContribution] = useState("50.000,00");
  const [topN, setTopN] = useState("10");
  const [rebalancing, setRebalancing] = useState<RebalancingResponse | null>(
    null
  );

  const hasTargets = targets.length > 0;

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
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao calcular");
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Planejador de Aporte</h1>

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
                className="w-48 pl-10 pr-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
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
              className="w-24 px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
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
                        {formatBRL(
                          Math.min(
                            rebalancing.reserva_gap,
                            rebalancing.contribution
                          )
                        )}
                      </span>
                    </p>
                    {rebalancing.reserva_gap >= rebalancing.contribution ? (
                      <p className="text-xs text-[var(--color-warning)] mt-1">
                        Todo o aporte vai para a reserva. Faltam{" "}
                        {formatBRL(
                          rebalancing.reserva_gap - rebalancing.contribution
                        )}{" "}
                        após este aporte.
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        Restante para investimentos:{" "}
                        {formatBRL(
                          rebalancing.contribution - rebalancing.reserva_gap
                        )}
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

            {/* Class breakdown */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Classe
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Meta %
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Atual %
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Gap (R$)
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rebalancing.class_breakdown.map((c) => (
                    <tr
                      key={c.asset_class}
                      className="border-b border-[var(--color-border)]/50"
                    >
                      <td className="px-3 py-2">{c.label}</td>
                      <td className="px-3 py-2">
                        {formatPercent(c.target_pct)}
                      </td>
                      <td className="px-3 py-2">
                        {formatPercent(c.current_pct)}
                      </td>
                      <td
                        className={`px-3 py-2 ${c.gap >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}
                      >
                        {formatBRL(c.gap)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            c.status === "APORTAR"
                              ? "bg-[var(--color-positive)]/15 text-[var(--color-positive)]"
                              : "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Asset plan */}
            {(rebalancing.asset_plan.length > 0 ||
              (rebalancing.reserva_gap != null &&
                rebalancing.reserva_gap > 0)) && (
              <div className="overflow-x-auto">
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-2 mt-4">
                  Plano por Ativo (Top {topN})
                </h3>
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
                        Aportar (R$)
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                        Aportar (USD)
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
                          <td className="px-3 py-2 font-bold text-cyan-400">
                            {formatBRL(
                              Math.min(
                                rebalancing.reserva_gap,
                                rebalancing.contribution
                              )
                            )}
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
                              type={a.asset_class}
                              size={20}
                            />
                            {a.ticker}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                          {a.asset_class}
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
                        <td className="px-3 py-2 font-bold">
                          {formatBRL(a.amount_to_invest)}
                        </td>
                        <td className="px-3 py-2 text-[var(--color-text-muted)]">
                          {a.amount_to_invest_usd
                            ? formatUSD(a.amount_to_invest_usd)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--color-border)] font-bold">
                      <td className="px-3 py-2" colSpan={5}>
                        TOTAL PLANEJADO
                      </td>
                      <td className="px-3 py-2">
                        {formatBRL(
                          Number(rebalancing.total_planned || 0) +
                            (rebalancing.reserva_gap != null &&
                            Number(rebalancing.reserva_gap) > 0
                              ? Math.min(
                                  Number(rebalancing.reserva_gap),
                                  Number(rebalancing.contribution)
                                )
                              : 0)
                        )}
                      </td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
