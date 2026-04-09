"use client";

import { X, FileText } from "lucide-react";
import { AllocationBucket, RebalancingResponse } from "@/types";
import { formatBRL, formatCurrency } from "@/lib/format";

interface CalculationMemoryModalProps {
  open: boolean;
  topN: number;
  reserveAllocation: number;
  remainingForInvestments: number;
  onClose: () => void;
  rebalancing: RebalancingResponse | null;
}

const BUCKET_LABELS: Record<AllocationBucket, string> = {
  STOCK_BR: "Ações (Brasil)",
  STOCK_US: "Stocks",
  ETF_INTL: "ETFs (Exterior)",
  FII: "FIIs",
  RF: "Renda Fixa",
};

export default function CalculationMemoryModal({
  open,
  topN,
  reserveAllocation,
  remainingForInvestments,
  onClose,
  rebalancing,
}: CalculationMemoryModalProps) {
  if (!open || !rebalancing) return null;

  const investableCurrent = rebalancing.class_breakdown.reduce(
    (total, item) => total + Number(item.current_value),
    0
  );
  const investableAfter = investableCurrent + remainingForInvestments;
  const hasReservePriority =
    rebalancing.reserva_gap != null && Number(rebalancing.reserva_gap) > 0;
  const selectedGapTotal = rebalancing.asset_plan.reduce(
    (total, asset) => total + Number(asset.gap),
    0
  );

  const assetsByClass = rebalancing.asset_plan.reduce(
    (acc, asset) => {
      const bucket = asset.allocation_bucket;
      const entry = acc[bucket] ?? {
        count: 0,
        totalGap: 0,
        totalPlanned: 0,
      };
      entry.count += 1;
      entry.totalGap += Number(asset.gap);
      entry.totalPlanned += Number(asset.amount_to_invest);
      acc[bucket] = entry;
      return acc;
    },
    {} as Partial<
      Record<
        AllocationBucket,
        {
          count: number;
          totalGap: number;
          totalPlanned: number;
        }
      >
    >
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 px-4 py-6">
      <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-[var(--color-accent)]">
              <FileText size={18} />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                Memória de Cálculo
              </span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-[var(--color-text-primary)]">
              Como o plano foi montado
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Explicação dinâmica da ordem do cálculo, da prioridade da reserva
              e do rateio entre os ativos sugeridos.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-main)] hover:text-[var(--color-text-primary)]"
            aria-label="Fechar memória de cálculo"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-6 py-5">
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard label="Aporte informado" value={formatBRL(rebalancing.contribution)} />
            <SummaryCard
              label={hasReservePriority ? "Reserva separada" : "Reserva já coberta"}
              value={hasReservePriority ? formatBRL(reserveAllocation) : "R$ 0,00"}
              accent={hasReservePriority}
            />
            <SummaryCard
              label="Restante para investir"
              value={formatBRL(remainingForInvestments)}
            />
            <SummaryCard
              label={`Ativos considerados`}
              value={`${rebalancing.asset_plan.length} de ${topN}`}
            />
          </div>

          <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)]/30 p-5">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              1. Separação inicial entre reserva e carteira investível
            </h3>
            <div className={`mt-3 grid gap-3 ${hasReservePriority ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
              {hasReservePriority && (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                    Reserva
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                    O cálculo compara o valor atual da reserva com a meta e
                    direciona primeiro o que faltar, limitado ao aporte do mês.
                  </p>
                  <div className="mt-3 space-y-1 text-sm">
                    <p>Reserva atual: <span className="font-semibold">{formatBRL(rebalancing.reserva_valor)}</span></p>
                    <p>Meta da reserva: <span className="font-semibold">{rebalancing.reserva_target != null ? formatBRL(rebalancing.reserva_target) : "—"}</span></p>
                    <p>Gap da reserva: <span className="font-semibold text-cyan-400">{rebalancing.reserva_gap != null ? formatBRL(rebalancing.reserva_gap) : "—"}</span></p>
                    <p>Aporte enviado para reserva: <span className="font-semibold text-cyan-400">{formatBRL(reserveAllocation)}</span></p>
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  Base investível
                </p>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  {hasReservePriority
                    ? "As metas por classe são recalculadas sobre a carteira investível após descontar a parcela que foi para a reserva."
                    : "Como a reserva já está no alvo ou acima dele, todo o aporte segue para a carteira investível."}
                </p>
                <div className="mt-3 space-y-1 text-sm">
                  <p>Investível atual: <span className="font-semibold">{formatBRL(investableCurrent)}</span></p>
                  <p>Restante para investir: <span className="font-semibold">{formatBRL(remainingForInvestments)}</span></p>
                  <p>Investível pós-aporte: <span className="font-semibold">{formatBRL(investableAfter)}</span></p>
                  <p>Patrimônio pós-aporte: <span className="font-semibold">{formatBRL(rebalancing.patrimonio_pos_aporte)}</span></p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)]/30 p-5">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              2. Meta e gap por classe
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Cada classe recebe um valor alvo em reais sobre a carteira
              investível pós-aporte. O gap é a diferença entre esse alvo e o
              valor atual da classe.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Classe
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Atual
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Meta em R$
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Gap
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Efeito no plano
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rebalancing.class_breakdown.map((item) => (
                    <tr
                      key={item.allocation_bucket}
                      className="border-b border-[var(--color-border)]/50"
                    >
                      <td className="px-3 py-2">{item.label}</td>
                      <td className="px-3 py-2">{formatBRL(item.current_value)}</td>
                      <td className="px-3 py-2">{formatBRL(item.target_value)}</td>
                      <td
                        className={`px-3 py-2 font-medium ${
                          item.gap >= 0
                            ? "text-[var(--color-positive)]"
                            : "text-[var(--color-warning)]"
                        }`}
                      >
                        {formatBRL(item.gap)}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                        {item.gap > 0
                          ? "Classe abaixo da meta"
                          : "Classe no alvo ou acima"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-main)]/30 p-5">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              3. Seleção dos ativos do plano
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              O plano escolhe até {topN} ativos com maior defasagem dentro das
              classes elegíveis e usa o gap individual de cada ticker como base
              para o rateio do aporte restante.
            </p>

            {rebalancing.asset_plan.length > 0 && (
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Regra da participação no rateio
                </p>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  A participação de cada ativo no rateio é calculada por:
                </p>
                <p className="mt-2 rounded-lg bg-[var(--color-bg-main)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)]">
                  participação = gap do ativo / soma dos gaps dos ativos selecionados
                </p>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  Neste plano, a soma dos gaps selecionados é{" "}
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {formatBRL(selectedGapTotal)}
                  </span>
                  . Depois, o aporte final do ativo é:
                </p>
                <p className="mt-2 rounded-lg bg-[var(--color-bg-main)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)]">
                  aporte do ativo = restante para investir × participação
                </p>
              </div>
            )}

            {Object.keys(assetsByClass).length > 0 && (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {Object.entries(assetsByClass).map(([bucket, info]) => (
                  <div
                    key={bucket}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
                  >
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {BUCKET_LABELS[bucket as AllocationBucket]}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                      {info?.count ?? 0} ativo(s) selecionado(s)
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      Gap somado:{" "}
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {formatBRL(info?.totalGap ?? 0)}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      Aporte planejado:{" "}
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {formatBRL(info?.totalPlanned ?? 0)}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Ativo
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Gap do ativo
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Participação no rateio
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Memória da participação
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Memória do aporte
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rebalancing.asset_plan.map((asset) => {
                    const gap = Number(asset.gap);
                    const ratio = selectedGapTotal > 0 ? gap / selectedGapTotal : 0;
                    return (
                      <tr
                        key={asset.ticker}
                        className="border-b border-[var(--color-border)]/50"
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium">{asset.ticker}</div>
                          <div className="text-xs text-[var(--color-text-muted)]">
                            {BUCKET_LABELS[asset.allocation_bucket]}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[var(--color-positive)]">
                          {formatBRL(asset.gap)}
                        </td>
                        <td className="px-3 py-2">
                          {(ratio * 100).toFixed(2)}%
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                          {formatBRL(gap)} / {formatBRL(selectedGapTotal)}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                          {formatBRL(remainingForInvestments)} ×{" "}
                          {(ratio * 100).toFixed(2)}% ={" "}
                          <span className="font-semibold text-[var(--color-text-primary)]">
                            {formatBRL(asset.amount_to_invest)}
                          </span>
                          {asset.amount_to_invest_native != null &&
                          asset.quote_currency !== "BRL" ? (
                            <span className="mt-1 block text-xs font-normal text-[var(--color-text-muted)]">
                              {formatCurrency(
                                asset.amount_to_invest_native,
                                asset.quote_currency
                              )}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {rebalancing.asset_plan.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]"
                      >
                        Não houve ativos selecionados. Neste cenário, o aporte
                        foi consumido integralmente pela reserva.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {rebalancing.asset_plan.length > 0 && (
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 text-sm text-[var(--color-text-secondary)]">
                Soma dos gaps dos ativos selecionados:{" "}
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {formatBRL(selectedGapTotal)}
                </span>
                . O aporte restante de{" "}
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {formatBRL(remainingForInvestments)}
                </span>{" "}
                é dividido proporcionalmente a essa soma.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-main)]/40 p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p
        className={`mt-2 text-lg font-semibold ${
          accent ? "text-cyan-400" : "text-[var(--color-text-primary)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
