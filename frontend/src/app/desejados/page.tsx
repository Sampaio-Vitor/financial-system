"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  Asset,
  AllocationTarget,
  AssetType,
  RebalancingResponse,
} from "@/types";
import { formatBRL, formatUSD, formatPercent } from "@/lib/format";
import AssetForm from "@/components/asset-form";
import { Trash2, Calculator } from "lucide-react";
import TickerLogo from "@/components/ticker-logo";

const CLASS_LABELS: Record<AssetType, string> = {
  STOCK: "Stocks (EUA)",
  ACAO: "Acoes (Brasil)",
  FII: "FIIs",
  RF: "Renda Fixa",
};

export default function DesejadosPage() {
  const [targets, setTargets] = useState<AllocationTarget[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [editTargets, setEditTargets] = useState<Record<AssetType, string>>({
    STOCK: "25",
    ACAO: "25",
    FII: "25",
    RF: "25",
  });
  const [contribution, setContribution] = useState("50000");
  const [topN, setTopN] = useState("10");
  const [rebalancing, setRebalancing] = useState<RebalancingResponse | null>(null);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [targetsData, assetsData] = await Promise.all([
        apiFetch<AllocationTarget[]>("/allocation-targets"),
        apiFetch<Asset[]>("/assets"),
      ]);
      setTargets(targetsData);
      setAssets(assetsData);

      const newTargets: Record<string, string> = {};
      for (const t of targetsData) {
        newTargets[t.asset_class] = (t.target_pct * 100).toString();
      }
      if (Object.keys(newTargets).length > 0) {
        setEditTargets(newTargets as Record<AssetType, string>);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveTargets = async () => {
    const items = Object.entries(editTargets).map(([cls, pct]) => ({
      asset_class: cls,
      target_pct: parseFloat(pct) / 100,
    }));
    const total = items.reduce((s, i) => s + i.target_pct, 0);
    if (Math.abs(total - 1.0) > 0.001) {
      alert(`A soma deve ser 100% (atual: ${(total * 100).toFixed(1)}%)`);
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/allocation-targets", {
        method: "PUT",
        body: JSON.stringify({ targets: items }),
      });
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleCalculate = async () => {
    try {
      const data = await apiFetch<RebalancingResponse>(
        `/rebalancing?contribution=${contribution}&top_n=${topN}`
      );
      setRebalancing(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao calcular");
    }
  };

  const handleDeleteAsset = async (id: number, ticker: string) => {
    if (!confirm(`Remover ${ticker} do catalogo?`)) return;
    try {
      await apiFetch(`/assets/${id}`, { method: "DELETE" });
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao remover");
    }
  };

  const groupedAssets = assets.reduce<Record<AssetType, Asset[]>>(
    (acc, a) => {
      if (!acc[a.type]) acc[a.type] = [];
      acc[a.type].push(a);
      return acc;
    },
    {} as Record<AssetType, Asset[]>
  );

  const targetTotal = Object.values(editTargets).reduce(
    (s, v) => s + (parseFloat(v) || 0),
    0
  );

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Ativos Desejados & Rebalanceamento</h1>

      {/* Section 1: Allocation Targets */}
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-4">
          Metas de Alocacao
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {(["STOCK", "ACAO", "FII", "RF"] as AssetType[]).map((cls) => (
            <div key={cls}>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">
                {CLASS_LABELS[cls]}
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={editTargets[cls] || "0"}
                  onChange={(e) =>
                    setEditTargets({ ...editTargets, [cls]: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                />
                <span className="text-sm text-[var(--color-text-muted)]">%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span
            className={`text-xs ${
              Math.abs(targetTotal - 100) < 0.1
                ? "text-[var(--color-positive)]"
                : "text-[var(--color-negative)]"
            }`}
          >
            Total: {targetTotal.toFixed(1)}%
          </span>
          <button
            onClick={handleSaveTargets}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Salvando..." : "Salvar Metas"}
          </button>
        </div>
      </div>

      {/* Section 2: Rebalancing Plan */}
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-4">
          Plano de Aporte
        </h2>
        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">
              Aporte deste mes (R$)
            </label>
            <input
              type="number"
              value={contribution}
              onChange={(e) => setContribution(e.target.value)}
              className="w-40 px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
            />
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
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-positive)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Calculator size={16} /> Calcular
            </button>
          </div>
        </div>

        {rebalancing && (
          <div className="space-y-4">
            <div className="text-xs text-[var(--color-text-muted)]">
              Patrimonio Atual: {formatBRL(rebalancing.patrimonio_atual)} |
              Pos-Aporte: {formatBRL(rebalancing.patrimonio_pos_aporte)}
            </div>

            {/* Reserve priority alert */}
            {rebalancing.reserva_gap != null && rebalancing.reserva_gap > 0 && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <div className="shrink-0 w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                  <span className="text-cyan-400 text-lg font-bold">!</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-cyan-400">Reserva Financeira (Prioridade)</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Atual: {formatBRL(rebalancing.reserva_valor)} |
                    Meta: {formatBRL(rebalancing.reserva_target!)} |
                    Aportar na reserva: <span className="font-bold text-cyan-400">{formatBRL(Math.min(rebalancing.reserva_gap, rebalancing.contribution))}</span>
                  </p>
                  {rebalancing.reserva_gap >= rebalancing.contribution ? (
                    <p className="text-xs text-[var(--color-warning)] mt-1">
                      Todo o aporte vai para a reserva. Faltam {formatBRL(rebalancing.reserva_gap - rebalancing.contribution)} apos este aporte.
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      Restante para investimentos: {formatBRL(rebalancing.contribution - rebalancing.reserva_gap)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {rebalancing.reserva_target != null && rebalancing.reserva_gap != null && rebalancing.reserva_gap <= 0 && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-positive)]/10 border border-[var(--color-positive)]/20">
                <p className="text-xs text-[var(--color-positive)] font-medium">
                  Reserva completa ({formatBRL(rebalancing.reserva_valor)} / {formatBRL(rebalancing.reserva_target)}) — todo o aporte vai para investimentos.
                </p>
              </div>
            )}

            {/* Class breakdown */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Classe</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Meta %</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Atual %</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Gap (R$)</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rebalancing.class_breakdown.map((c) => (
                    <tr key={c.asset_class} className="border-b border-[var(--color-border)]/50">
                      <td className="px-3 py-2">{c.label}</td>
                      <td className="px-3 py-2">{formatPercent(c.target_pct)}</td>
                      <td className="px-3 py-2">{formatPercent(c.current_pct)}</td>
                      <td className={`px-3 py-2 ${c.gap >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}>
                        {formatBRL(c.gap)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          c.status === "APORTAR"
                            ? "bg-[var(--color-positive)]/15 text-[var(--color-positive)]"
                            : "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Asset plan */}
            {rebalancing.asset_plan.length > 0 && (
              <div className="overflow-x-auto">
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-2 mt-4">
                  Plano por Ativo (Top {topN})
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Ticker</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Classe</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Valor Atual</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Valor Alvo</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Gap</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Aportar (R$)</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Aportar (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rebalancing.asset_plan.map((a) => (
                      <tr key={a.ticker} className="border-b border-[var(--color-border)]/50">
                        <td className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-2">
                            <TickerLogo ticker={a.ticker} type={a.asset_class} size={20} />
                            {a.ticker}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[var(--color-text-secondary)]">{a.asset_class}</td>
                        <td className="px-3 py-2">{formatBRL(a.current_value)}</td>
                        <td className="px-3 py-2">{formatBRL(a.target_value)}</td>
                        <td className="px-3 py-2 text-[var(--color-positive)]">{formatBRL(a.gap)}</td>
                        <td className="px-3 py-2 font-bold">{formatBRL(a.amount_to_invest)}</td>
                        <td className="px-3 py-2 text-[var(--color-text-muted)]">
                          {a.amount_to_invest_usd ? formatUSD(a.amount_to_invest_usd) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--color-border)] font-bold">
                      <td className="px-3 py-2" colSpan={5}>TOTAL PLANEJADO</td>
                      <td className="px-3 py-2">{formatBRL(rebalancing.total_planned)}</td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 3: Assets by class */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-secondary)]">
            Ativos ({assets.length})
          </h2>
          <button
            onClick={() => setShowAssetForm(true)}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Adicionar Ativo
          </button>
        </div>

        {showAssetForm && (
          <AssetForm
            onClose={() => setShowAssetForm(false)}
            onSaved={() => {
              setShowAssetForm(false);
              fetchData();
            }}
          />
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(["STOCK", "ACAO", "FII", "RF"] as AssetType[]).map((cls) => {
            const clsAssets = groupedAssets[cls] || [];

            return (
              <div
                key={cls}
                className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4 flex flex-col"
              >
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-3 flex items-center justify-between">
                  <span>{CLASS_LABELS[cls]}</span>
                  <span className="text-[var(--color-text-muted)]">{clsAssets.length}</span>
                </h3>
                <div className="h-48 overflow-y-auto space-y-1 pr-1">
                  {clsAssets.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-muted)] text-center py-4">Nenhum ativo</p>
                  ) : (
                    clsAssets.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[var(--color-bg-main)] text-sm group transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <TickerLogo ticker={a.ticker} type={a.type} size={20} />
                          <span className="font-medium">{a.ticker}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteAsset(a.id, a.ticker)}
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-negative)] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
