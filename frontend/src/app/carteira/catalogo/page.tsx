"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Asset, AllocationTarget, AssetType } from "@/types";
import AssetForm from "@/components/asset-form";
import CsvImportModal from "@/components/csv-import-modal";
import TickerLogo from "@/components/ticker-logo";

const CLASS_LABELS: Record<AssetType, string> = {
  STOCK: "Stocks (EUA)",
  ACAO: "Ações (Brasil)",
  FII: "FIIs",
  RF: "Renda Fixa",
};

const ASSET_TYPES: AssetType[] = ["STOCK", "ACAO", "FII", "RF"];

type Tab = "ativos" | "metas";
type FilterType = "ALL" | "PAUSED" | AssetType;

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
  }, [fetchAssets, fetchTargets]);

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

  const filteredAssets =
    filter === "ALL"
      ? assets
      : filter === "PAUSED"
        ? assets.filter((a) => a.paused)
        : assets.filter((a) => a.type === filter);

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
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold text-[var(--color-text-secondary)]">
                {filteredAssets.length} ativos
              </span>
              <div className="flex gap-1 bg-[var(--color-bg-main)] rounded-lg p-1">
                <button
                  onClick={() => setFilter("ALL")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
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
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
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
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    filter === "PAUSED"
                      ? "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  }`}
                >
                  Pausados
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCsvImport(true)}
                className="px-4 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm font-medium hover:bg-[var(--color-bg-main)] transition-colors"
              >
                Importar CSV
              </button>
              <button
                onClick={() => setShowAssetForm(true)}
                className="px-4 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Adicionar Ativo
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Ticker
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Tipo
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Descrição
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-muted)]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                    >
                      Nenhum ativo encontrado
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((a) => (
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
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
