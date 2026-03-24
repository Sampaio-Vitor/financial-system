"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Asset, AllocationTarget, AssetType, AssetRebalancingInfo } from "@/types";
import { formatBRL } from "@/lib/format";
import AssetForm from "@/components/asset-form";
import CsvImportModal from "@/components/csv-import-modal";
import TickerLogo from "@/components/ticker-logo";
import MobileCard from "@/components/mobile-card";

const CLASS_LABELS: Record<AssetType, string> = {
  STOCK: "Stocks (EUA)",
  ACAO: "Ações (Brasil)",
  FII: "FIIs",
  RF: "Renda Fixa",
};

const ASSET_TYPES: AssetType[] = ["STOCK", "ACAO", "FII", "RF"];

type Tab = "ativos" | "metas";
type FilterType = "ALL" | "PAUSED" | AssetType;
type SortKey = "ticker" | "type" | "description" | "current_value" | "target_value" | "gap";
type SortDir = "asc" | "desc";

export default function CatalogoPage() {
  return (
    <Suspense>
      <CatalogoContent />
    </Suspense>
  );
}

function CatalogoContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeTab = (searchParams.get("tab") as Tab) || "ativos";

  const [assets, setAssets] = useState<Asset[]>([]);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [filter, setFilter] = useState<FilterType>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [rebalancingInfo, setRebalancingInfo] = useState<Map<number, AssetRebalancingInfo>>(new Map());

  const [editTargets, setEditTargets] = useState<Record<AssetType, string>>({
    STOCK: "25",
    ACAO: "25",
    FII: "25",
    RF: "25",
  });
  const [saving, setSaving] = useState(false);

  const fetchAssets = useCallback(async () => {
    try {
      const data = await apiFetch<Asset[]>("/assets");
      setAssets(data);
    } catch {}
  }, []);

  const fetchRebalancingInfo = useCallback(async () => {
    try {
      const data = await apiFetch<AssetRebalancingInfo[]>("/assets/rebalancing-info");
      const map = new Map<number, AssetRebalancingInfo>();
      for (const item of data) map.set(item.asset_id, item);
      setRebalancingInfo(map);
    } catch {}
  }, []);

  const fetchTargets = useCallback(async () => {
    try {
      const data = await apiFetch<AllocationTarget[]>("/allocation-targets");
      const newTargets: Record<string, string> = {};
      for (const t of data) {
        newTargets[t.asset_class] = (t.target_pct * 100).toString();
      }
      if (Object.keys(newTargets).length > 0) {
        setEditTargets(newTargets as Record<AssetType, string>);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchAssets();
    fetchTargets();
    fetchRebalancingInfo();
  }, [fetchAssets, fetchTargets, fetchRebalancingInfo]);

  const setTab = (tab: Tab) => {
    router.push(`/carteira/catalogo?tab=${tab}`, { scroll: false });
  };

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
      fetchTargets();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const togglePaused = async (asset: Asset) => {
    try {
      await apiFetch(`/assets/${asset.id}`, {
        method: "PUT",
        body: JSON.stringify({ paused: !asset.paused }),
      });
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, paused: !a.paused } : a))
      );
    } catch {}
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/assets/${deleteTarget.id}`, { method: "DELETE" });
      setAssets((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteError("");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erro ao remover ativo");
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredAssets =
    filter === "ALL"
      ? assets
      : filter === "PAUSED"
        ? assets.filter((a) => a.paused)
        : assets.filter((a) => a.type === filter);

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const infoA = rebalancingInfo.get(a.id);
    const infoB = rebalancingInfo.get(b.id);

    switch (sortKey) {
      case "ticker":
        return dir * a.ticker.localeCompare(b.ticker);
      case "type":
        return dir * a.type.localeCompare(b.type);
      case "description":
        return dir * (a.description || "").localeCompare(b.description || "");
      case "current_value":
        return dir * ((infoA?.current_value ?? 0) - (infoB?.current_value ?? 0));
      case "target_value":
        return dir * ((infoA?.target_value ?? 0) - (infoB?.target_value ?? 0));
      case "gap":
        return dir * ((infoA?.gap ?? 0) - (infoB?.gap ?? 0));
      default:
        return 0;
    }
  });

  const targetTotal = Object.values(editTargets).reduce(
    (s, v) => s + (parseFloat(v) || 0),
    0
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Catálogo</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-bg-main)] rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("ativos")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeTab === "ativos"
              ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          }`}
        >
          Ativos
        </button>
        <button
          onClick={() => setTab("metas")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeTab === "metas"
              ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          }`}
        >
          Metas
        </button>
      </div>

      {/* Tab: Ativos */}
      {activeTab === "ativos" && (
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)]">
          {/* Header */}
          <div className="p-4 border-b border-[var(--color-border)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-text-secondary)]">
                {filteredAssets.length} ativos
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCsvImport(true)}
                  className="px-3 md:px-4 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] text-xs md:text-sm font-medium hover:bg-[var(--color-bg-main)] transition-colors"
                >
                  Importar
                </button>
                <button
                  onClick={() => setShowAssetForm(true)}
                  className="px-3 md:px-4 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-xs md:text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Adicionar
                </button>
              </div>
            </div>
            <div className="overflow-x-auto -mx-4 px-4 pb-1">
              <div className="flex gap-1 bg-[var(--color-bg-main)] rounded-lg p-1 w-fit">
                <button
                  onClick={() => setFilter("ALL")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                    filter === "ALL"
                      ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  }`}
                >
                  Todos
                </button>
                {ASSET_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilter(type)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                      filter === type
                        ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {CLASS_LABELS[type]}
                  </button>
                ))}
                <button
                  onClick={() => setFilter("PAUSED")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                    filter === "PAUSED"
                      ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  }`}
                >
                  Pausados
                </button>
              </div>
            </div>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden p-4 space-y-2">
            {sortedAssets.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-8">
                Nenhum ativo encontrado
              </p>
            ) : (
              sortedAssets.map((a) => {
                const info = rebalancingInfo.get(a.id);
                const gapColor = info
                  ? info.gap > 0
                    ? "text-[var(--color-positive)]"
                    : info.gap < 0
                      ? "text-[var(--color-negative)]"
                      : "text-[var(--color-text-muted)]"
                  : "text-[var(--color-text-muted)]";

                return (
                  <MobileCard
                    key={a.id}
                    header={
                      <div className={`flex items-center gap-2 ${a.paused ? "opacity-40" : ""}`}>
                        <TickerLogo ticker={a.ticker} type={a.type} size={22} />
                        <span className="font-medium text-sm text-[var(--color-text-primary)]">
                          {a.ticker}
                        </span>
                        {a.paused && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-text-muted)]/20 text-[var(--color-text-muted)]">
                            pausado
                          </span>
                        )}
                      </div>
                    }
                    badge={
                      <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-bg-main)] text-[var(--color-text-secondary)]">
                        {CLASS_LABELS[a.type]}
                      </span>
                    }
                    bodyItems={[
                      { label: "Posicao Atual", value: info ? formatBRL(info.current_value) : "\u2014" },
                      { label: "Posicao Alvo", value: info ? formatBRL(info.target_value) : "\u2014" },
                    ]}
                    expandedItems={[
                      { label: "Descricao", value: a.description || "\u2014" },
                      { label: "Gap", value: <span className={gapColor}>{info ? formatBRL(info.gap) : "\u2014"}</span> },
                    ]}
                    actions={
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => togglePaused(a)}
                          title={a.paused ? "Retomar ativo" : "Pausar ativo"}
                          className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${
                            a.paused
                              ? "text-[var(--color-positive)] hover:bg-[var(--color-positive)]/10"
                              : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)]"
                          }`}
                        >
                          {a.paused ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                          )}
                        </button>
                        <button
                          onClick={() => { setDeleteTarget(a); setDeleteError(""); }}
                          title="Remover ativo"
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-negative)] hover:bg-[var(--color-negative)]/10 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    }
                  />
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {([
                    { key: "ticker" as SortKey, label: "Ticker", align: "left", title: undefined as string | undefined },
                    { key: "type" as SortKey, label: "Tipo", align: "left", title: undefined },
                    { key: "description" as SortKey, label: "Descrição", align: "left", title: undefined },
                    { key: "current_value" as SortKey, label: "Posição Atual", align: "right", title: "Valor de mercado da sua posição neste ativo (preço atual × quantidade). Baseado na última cotação disponível." as string | undefined },
                    { key: "target_value" as SortKey, label: "Posição Alvo", align: "right", title: "Quanto você deveria ter neste ativo para atingir sua meta de alocação, baseado no patrimônio investível atual e peso igual entre ativos da mesma classe." as string | undefined },
                    { key: "gap" as SortKey, label: "Gap", align: "right", title: undefined },
                  ]).map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className={`px-4 py-2.5 text-xs font-medium text-[var(--color-text-muted)] cursor-pointer select-none hover:text-[var(--color-text-secondary)] transition-colors ${
                        col.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      <span
                        className={`inline-flex items-center gap-1 ${col.align === "right" ? "justify-end" : ""} ${col.title ? "cursor-help" : ""}`}
                        title={col.title}
                      >
                        {col.label}
                        {col.title && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                        )}
                        {sortKey === col.key && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                            {sortDir === "asc"
                              ? <path d="M12 5v14M5 12l7-7 7 7" />
                              : <path d="M12 5v14M5 12l7 7 7-7" />}
                          </svg>
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-muted)]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedAssets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                    >
                      Nenhum ativo encontrado
                    </td>
                  </tr>
                ) : (
                  sortedAssets.map((a) => (
                    <tr
                      key={a.id}
                      className={`border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-main)]/50 transition-colors ${
                        a.paused ? "opacity-40" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <TickerLogo
                            ticker={a.ticker}
                            type={a.type}
                            size={24}
                          />
                          <span className="font-medium">{a.ticker}</span>
                          {a.paused && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-text-muted)]/20 text-[var(--color-text-muted)]">
                              pausado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-bg-main)] text-[var(--color-text-secondary)]">
                          {CLASS_LABELS[a.type]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                        {a.description || "—"}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right text-[var(--color-text-secondary)] cursor-help"
                        title={a.price_updated_at
                          ? `Cotação atualizada em ${new Date(a.price_updated_at).toLocaleString("pt-BR")}`
                          : "Cotação não disponível"}
                      >
                        {rebalancingInfo.has(a.id)
                          ? formatBRL(rebalancingInfo.get(a.id)!.current_value)
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[var(--color-text-secondary)]">
                        {rebalancingInfo.has(a.id)
                          ? formatBRL(rebalancingInfo.get(a.id)!.target_value)
                          : "—"}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-medium ${
                        rebalancingInfo.has(a.id) && rebalancingInfo.get(a.id)!.gap > 0
                          ? "text-[var(--color-positive)]"
                          : rebalancingInfo.has(a.id) && rebalancingInfo.get(a.id)!.gap < 0
                            ? "text-[var(--color-negative)]"
                            : "text-[var(--color-text-muted)]"
                      }`}>
                        {rebalancingInfo.has(a.id)
                          ? formatBRL(rebalancingInfo.get(a.id)!.gap)
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => togglePaused(a)}
                            title={a.paused ? "Retomar ativo" : "Pausar ativo"}
                            className={`p-1.5 rounded-lg transition-colors ${
                              a.paused
                                ? "text-[var(--color-positive)] hover:bg-[var(--color-positive)]/10"
                                : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)]"
                            }`}
                          >
                            {a.paused ? (
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <rect x="6" y="4" width="4" height="16" />
                                <rect x="14" y="4" width="4" height="16" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(a); setDeleteError(""); }}
                            title="Remover ativo"
                            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-negative)] hover:bg-[var(--color-negative)]/10 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {showAssetForm && (
            <AssetForm
              onClose={() => setShowAssetForm(false)}
              onSaved={() => {
                setShowAssetForm(false);
                fetchAssets();
              }}
            />
          )}

          {showCsvImport && (
            <CsvImportModal
              onClose={() => setShowCsvImport(false)}
              onSaved={() => {
                setShowCsvImport(false);
                fetchAssets();
              }}
            />
          )}

          {deleteTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
              <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-sm">
                <h3 className="text-base font-bold mb-2">Remover ativo</h3>
                <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                  Remover <span className="font-semibold">{deleteTarget.ticker}</span> do seu catálogo? Seu histórico de compras será preservado.
                </p>
                {deleteError && (
                  <p className="text-sm text-[var(--color-negative)] mb-4">{deleteError}</p>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setDeleteTarget(null); setDeleteError(""); }}
                    className="px-4 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm font-medium hover:bg-[var(--color-bg-main)] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-1.5 rounded-lg bg-[var(--color-negative)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Metas */}
      {activeTab === "metas" && (
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-4">
            Metas de Alocação
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {ASSET_TYPES.map((cls) => (
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
                  <span className="text-sm text-[var(--color-text-muted)]">
                    %
                  </span>
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
      )}
    </div>
  );
}
