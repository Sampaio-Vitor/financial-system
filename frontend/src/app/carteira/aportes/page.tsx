"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { AssetType, Purchase } from "@/types";
import { formatBRL, formatQuantity } from "@/lib/format";
import PurchaseForm from "@/components/purchase-form";
import TickerLogo from "@/components/ticker-logo";

type OperationFilter = "todos" | "compras" | "vendas";

export default function AportesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"compra" | "venda">("compra");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{
    purchase_date: string;
    quantity: string;
    unit_price: string;
  }>({ purchase_date: "", quantity: "", unit_price: "" });
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<AssetType | "">("");
  const [filterTicker, setFilterTicker] = useState("");
  const [filterOperation, setFilterOperation] = useState<OperationFilter>("todos");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);

  const hasActiveFilters = filterType !== "" || filterTicker !== "" || filterOperation !== "todos" || filterDateFrom !== "" || filterDateTo !== "";

  const clearFilters = () => {
    setFilterType("");
    setFilterTicker("");
    setFilterOperation("todos");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (filterType && p.asset_type !== filterType) return false;
      if (filterTicker && !p.ticker?.toLowerCase().includes(filterTicker.toLowerCase())) return false;
      if (filterOperation === "compras" && p.quantity < 0) return false;
      if (filterOperation === "vendas" && p.quantity >= 0) return false;
      if (filterDateFrom && p.purchase_date < filterDateFrom) return false;
      if (filterDateTo && p.purchase_date > filterDateTo) return false;
      return true;
    });
  }, [purchases, filterType, filterTicker, filterOperation, filterDateFrom, filterDateTo]);

  const filteredTotal = useMemo(() => {
    return filteredPurchases.reduce((sum, p) => sum + p.total_value, 0);
  }, [filteredPurchases]);

  const fetchPurchases = useCallback(async () => {
    try {
      const data = await apiFetch<Purchase[]>("/purchases");
      setPurchases(data.filter((p) => p.asset_type !== "RF"));
    } catch {
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleDelete = async (id: number) => {
    if (!confirm("Remover este aporte? Isso afetara os calculos da carteira.")) return;
    try {
      await apiFetch(`/purchases/${id}`, { method: "DELETE" });
      fetchPurchases();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao remover");
    }
  };

  const startEdit = (p: Purchase) => {
    setEditingId(p.id);
    setEditData({
      purchase_date: p.purchase_date,
      quantity: Number(p.quantity).toFixed(2),
      unit_price: Number(p.unit_price).toFixed(2),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      await apiFetch(`/purchases/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          purchase_date: editData.purchase_date,
          quantity: parseFloat(editData.quantity),
          unit_price: parseFloat(editData.unit_price),
        }),
      });
      setEditingId(null);
      fetchPurchases();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Aportes em Renda Variavel</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setFormMode("compra"); setShowForm(true); }}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Registrar Aporte
          </button>
          <button
            onClick={() => { setFormMode("venda"); setShowForm(true); }}
            className="px-4 py-2 rounded-lg bg-[var(--color-negative)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Registrar Venda
          </button>
        </div>
      </div>

      {showForm && (
        <PurchaseForm
          mode={formMode}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            fetchPurchases();
          }}
        />
      )}

      {/* Filters */}
      {!loading && purchases.length > 0 && (
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--color-text-muted)]">Tipo</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as AssetType | "")}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm w-full"
              >
                <option value="">Todos</option>
                <option value="STOCK">Stocks</option>
                <option value="ACAO">Acoes</option>
                <option value="FII">FIIs</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--color-text-muted)]">Ticker</label>
              <input
                type="text"
                placeholder="Buscar ticker..."
                value={filterTicker}
                onChange={(e) => setFilterTicker(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--color-text-muted)]">Operacao</label>
              <select
                value={filterOperation}
                onChange={(e) => setFilterOperation(e.target.value as OperationFilter)}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm w-full"
              >
                <option value="todos">Todas</option>
                <option value="compras">Compras</option>
                <option value="vendas">Vendas</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 cursor-pointer" onClick={() => dateFromRef.current?.showPicker()}>
              <label className="text-xs text-[var(--color-text-muted)]">De</label>
              <input
                ref={dateFromRef}
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm w-full cursor-pointer"
              />
            </div>
            <div className="flex flex-col gap-1 cursor-pointer" onClick={() => dateToRef.current?.showPicker()}>
              <label className="text-xs text-[var(--color-text-muted)]">Ate</label>
              <input
                ref={dateToRef}
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm w-full cursor-pointer"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]/50 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              <div className="flex items-center gap-4">
                <span>{filteredPurchases.length} de {purchases.length} registros</span>
                <span>Total filtrado: <span className="font-medium text-[var(--color-text-primary)]">{formatBRL(filteredTotal)}</span></span>
              </div>
              <button
                onClick={clearFilters}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
        {loading ? (
          <div className="animate-pulse h-64" />
        ) : purchases.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-center py-8">
            Nenhum aporte registrado.
          </p>
        ) : filteredPurchases.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-center py-8">
            Nenhum resultado para os filtros selecionados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Data</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Ticker</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Tipo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Qtd</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Preco Unit.</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Total</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-muted)]">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.map((p) => {
                  const isSale = p.quantity < 0;
                  return (
                  <tr key={p.id} className={`border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50 ${isSale ? "bg-[var(--color-negative)]/5" : ""}`}>
                    {editingId === p.id ? (
                      <>
                        <td className="px-3 py-1.5">
                          <input
                            type="date"
                            value={editData.purchase_date}
                            onChange={(e) => setEditData({ ...editData, purchase_date: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-medium">
                          <div className="flex items-center gap-2">
                            <TickerLogo ticker={p.ticker!} type={p.asset_type!} size={20} />
                            {p.ticker}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{p.asset_type}</td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={editData.quantity}
                            onChange={(e) => setEditData({ ...editData, quantity: e.target.value })}
                            className="w-24 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={editData.unit_price}
                            onChange={(e) => setEditData({ ...editData, unit_price: e.target.value })}
                            className="w-28 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-medium text-[var(--color-text-muted)]">
                          {formatBRL(parseFloat(editData.quantity) * parseFloat(editData.unit_price) || 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => saveEdit(p.id)}
                              disabled={saving}
                              className="text-xs text-[var(--color-positive)] hover:underline disabled:opacity-50"
                            >
                              {saving ? "..." : "Salvar"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-xs text-[var(--color-text-muted)] hover:underline"
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5">
                          {new Date(p.purchase_date + "T00:00:00").toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-3 py-2.5 font-medium">
                          <div className="flex items-center gap-2">
                            <TickerLogo ticker={p.ticker!} type={p.asset_type!} size={20} />
                            {p.ticker}
                            {isSale && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-negative)]/15 text-[var(--color-negative)]">
                                VENDA
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{p.asset_type}</td>
                        <td className={`px-3 py-2.5 ${isSale ? "text-[var(--color-negative)]" : ""}`}>
                          {formatQuantity(p.quantity)}
                        </td>
                        <td className="px-3 py-2.5">{formatBRL(p.unit_price)}</td>
                        <td className={`px-3 py-2.5 font-medium ${isSale ? "text-[var(--color-negative)]" : ""}`}>
                          {formatBRL(p.total_value)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEdit(p)}
                              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                              title="Editar"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                <path d="m15 5 4 4"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="text-[var(--color-text-muted)] hover:text-[var(--color-negative)] transition-colors"
                              title="Remover"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
