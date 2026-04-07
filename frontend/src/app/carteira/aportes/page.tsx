"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-modal";
import { apiFetch } from "@/lib/api";
import { AssetType, Purchase, PurchasePageResponse } from "@/types";
import { formatBRL, formatEditableNumber, formatQuantity, formatUSD } from "@/lib/format";
import PurchaseForm from "@/components/purchase-form";
import TickerLogo from "@/components/ticker-logo";

type OperationFilter = "todos" | "compras" | "vendas";

function calculateUnitPrice(totalValue: string, quantity: string): number | null {
  const total = parseFloat(totalValue);
  const qty = parseFloat(quantity);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(qty) || qty === 0) {
    return null;
  }
  return total / Math.abs(qty);
}

export default function AportesPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"compra" | "venda">("compra");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{
    purchase_date: string;
    quantity: string;
    total_value: string;
    trade_currency: "BRL" | "USD";
    fx_rate: string;
  }>({ purchase_date: "", quantity: "", total_value: "", trade_currency: "BRL", fx_rate: "1.0000" });
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<AssetType | "">("");
  const [filterTicker, setFilterTicker] = useState("");
  const [filterOperation, setFilterOperation] = useState<OperationFilter>("todos");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);

  const hasActiveFilters = filterType !== "" || filterTicker !== "" || filterOperation !== "todos" || filterDateFrom !== "" || filterDateTo !== "";
  const filtersKey = [filterType, filterTicker, filterOperation, filterDateFrom, filterDateTo].join("|");
  const lastFiltersKeyRef = useRef(filtersKey);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = totalCount === 0 ? 0 : pageStart + purchases.length - 1;
  const pageSubtotal = purchases.reduce((sum, purchase) => sum + purchase.total_value, 0);

  const clearFilters = () => {
    setFilterType("");
    setFilterTicker("");
    setFilterOperation("todos");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(1);
  };

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });

      if (filterType) params.set("asset_type", filterType);
      if (filterTicker.trim()) params.set("ticker", filterTicker.trim());
      if (filterOperation !== "todos") params.set("operation", filterOperation);
      if (filterDateFrom) params.set("date_from", filterDateFrom);
      if (filterDateTo) params.set("date_to", filterDateTo);

      const data = await apiFetch<PurchasePageResponse>(`/purchases/rv?${params.toString()}`);
      const normalizedItems = data.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        total_value: Number(item.total_value),
        unit_price_native: Number(item.unit_price_native),
        total_value_native: Number(item.total_value_native),
        fx_rate: Number(item.fx_rate),
      }));

      setPurchases(normalizedItems);
      setTotalCount(data.total_count);

      if (data.total_count > 0 && normalizedItems.length === 0 && page > 1) {
        setPage(Math.min(page - 1, data.total_pages));
      }
    } catch {
      setPurchases([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [filterDateFrom, filterDateTo, filterOperation, filterTicker, filterType, page, pageSize]);

  useEffect(() => {
    const filtersChanged = lastFiltersKeyRef.current !== filtersKey;
    if (filtersChanged) {
      lastFiltersKeyRef.current = filtersKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }

    fetchPurchases();
  }, [fetchPurchases, filtersKey, page]);

  const refreshPurchases = useCallback(() => {
    if (page === 1) {
      fetchPurchases();
      return;
    }
    setPage(1);
  }, [fetchPurchases, page]);

  const handleDelete = useCallback(
    async (id: number) => {
      const ok = await confirm(
        "Remover Aporte",
        "Remover este aporte? Isso afetara os calculos da carteira."
      );
      if (!ok) return;
      try {
        await apiFetch(`/purchases/${id}`, { method: "DELETE" });
        if (purchases.length === 1 && page > 1) {
          setPage((current) => Math.max(1, current - 1));
        } else {
          fetchPurchases();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao remover");
      }
    },
    [confirm, fetchPurchases, page, purchases.length]
  );

  const startEdit = (p: Purchase) => {
    setEditingId(p.id);
    setEditData({
      purchase_date: p.purchase_date,
      quantity: formatEditableNumber(p.quantity),
      total_value: formatEditableNumber(
        Math.abs(
        p.trade_currency === "USD" ? p.total_value_native : p.total_value
        )
      ),
      trade_currency: p.trade_currency,
      fx_rate: formatEditableNumber(p.fx_rate ?? 1, 4),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = useCallback(
    async (id: number) => {
      setSaving(true);
      try {
        const isUsdTrade = editData.trade_currency === "USD";
        const calculatedUnitPrice = calculateUnitPrice(editData.total_value, editData.quantity);
        if (calculatedUnitPrice == null) {
          throw new Error("Informe quantidade e valor total validos");
        }

        await apiFetch(`/purchases/${id}`, {
          method: "PUT",
          body: JSON.stringify({
            purchase_date: editData.purchase_date,
            quantity: parseFloat(editData.quantity),
            trade_currency: editData.trade_currency,
            ...(isUsdTrade
              ? {
                  unit_price_native: calculatedUnitPrice,
                  fx_rate: parseFloat(editData.fx_rate),
                }
              : {
                  unit_price: calculatedUnitPrice,
                }),
          }),
        });
        setEditingId(null);
        fetchPurchases();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      } finally {
        setSaving(false);
      }
    },
    [editData, fetchPurchases]
  );

  const renderUnitPrice = (p: Purchase) => {
    if (p.trade_currency === "USD") {
      return (
        <>
          <span>{formatUSD(p.unit_price_native)}</span>
          <span className="text-[10px] text-[var(--color-text-muted)] ml-1">({formatBRL(p.unit_price)})</span>
        </>
      );
    }
    return formatBRL(p.unit_price);
  };

  const renderTotalValue = (p: Purchase) => {
    if (p.trade_currency === "USD") {
      return (
        <>
          <span>{formatBRL(p.total_value)}</span>
          <span className="text-[10px] text-[var(--color-text-muted)] ml-1">({formatUSD(p.total_value_native)})</span>
        </>
      );
    }
    return formatBRL(p.total_value);
  };

  const editIsUsd = editData.trade_currency === "USD";
  const editNativeTotal = parseFloat(editData.total_value) || 0;
  const editBrlTotal = editIsUsd
    ? editNativeTotal * (parseFloat(editData.fx_rate) || 0)
    : editNativeTotal;
  const editCalculatedUnitPrice = calculateUnitPrice(editData.total_value, editData.quantity) || 0;

  return (
    <div>
      <ConfirmDialog />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <h1 className="text-xl font-bold">Aportes em Renda Variavel</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setFormMode("compra"); setShowForm(true); }}
            className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-xs md:text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Registrar Aporte
          </button>
          <button
            onClick={() => { setFormMode("venda"); setShowForm(true); }}
            className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-[var(--color-negative)] text-white text-xs md:text-sm font-medium hover:opacity-90 transition-opacity"
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
            refreshPurchases();
          }}
        />
      )}

      {/* Filters */}
      {!loading && (totalCount > 0 || hasActiveFilters) && (
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
          {(hasActiveFilters || totalCount > 0) && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]/50 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              <div>{totalCount} registros encontrados</div>
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
        ) : totalCount === 0 && !hasActiveFilters ? (
          <p className="text-[var(--color-text-muted)] text-center py-8">
            Nenhum aporte registrado.
          </p>
        ) : totalCount === 0 ? (
          <p className="text-[var(--color-text-muted)] text-center py-8">
            Nenhum resultado para os filtros selecionados.
          </p>
        ) : (
          <>
          <div className="mb-4 flex items-center justify-end">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-right">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                Subtotal exibido
              </div>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                {formatBRL(pageSubtotal)}
              </div>
            </div>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-2 p-2">
            {purchases.map((p) => {
              const isSale = p.quantity < 0;
              return (
                <div key={p.id} className={`bg-[var(--color-bg-main)] rounded-xl border border-[var(--color-border)] p-4 ${isSale ? "border-[var(--color-negative)]/30" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <TickerLogo ticker={p.ticker!} type={p.asset_type!} size={20} />
                      <span className="font-medium text-sm">{p.ticker}</span>
                      {p.trade_currency === "USD" && (
                        <span className="text-[9px] font-semibold px-1 py-px rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">USD</span>
                      )}
                      {isSale && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-negative)]/15 text-[var(--color-negative)]">
                          VENDA
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(p)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-negative)] transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <div>
                      <span className="text-xs text-[var(--color-text-muted)]">Data</span>
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        {new Date(p.purchase_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-[var(--color-text-muted)]">Total</span>
                      <div className={`text-sm font-medium flex flex-wrap items-baseline gap-x-1 ${isSale ? "text-[var(--color-negative)]" : "text-[var(--color-text-secondary)]"}`}>
                        {renderTotalValue(p)}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-[var(--color-text-muted)]">Qtd</span>
                      <div className={`text-sm ${isSale ? "text-[var(--color-negative)]" : "text-[var(--color-text-secondary)]"}`}>
                        {formatQuantity(p.quantity)}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-[var(--color-text-muted)]">Preco Unit.</span>
                      <div className="text-sm text-[var(--color-text-secondary)] flex flex-wrap items-baseline gap-x-1">{renderUnitPrice(p)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile bottom-sheet edit modal */}
          {editingId !== null && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:hidden">
              <div className="fixed inset-0 bg-black/50" onClick={cancelEdit} />
              <div className="relative w-full bg-[var(--color-bg-card)] rounded-t-2xl border-t border-[var(--color-border)] p-6 space-y-4">
                <h3 className="text-base font-bold text-[var(--color-text-primary)]">Editar Aporte</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Data</label>
                    <input type="date" value={editData.purchase_date} onChange={(e) => setEditData({ ...editData, purchase_date: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Quantidade</label>
                      <input type="number" step="any" min="-999999999" value={editData.quantity} onChange={(e) => setEditData({ ...editData, quantity: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-muted)] mb-1 block">
                        {editIsUsd ? "Valor Total (US$)" : "Valor Total (R$)"}
                      </label>
                      <input type="number" step="0.01" value={editData.total_value} onChange={(e) => setEditData({ ...editData, total_value: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                    </div>
                  </div>
                  {editIsUsd && (
                    <div>
                      <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Cambio USD/BRL</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--color-text-muted)]">R$</span>
                        <input type="number" step="0.0001" value={editData.fx_rate} onChange={(e) => setEditData({ ...editData, fx_rate: e.target.value })} className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                      </div>
                    </div>
                  )}
                  <div className="rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--color-text-muted)]">Preco unitario calculado</span>
                      <span className="text-base font-bold text-[var(--color-text-primary)]">
                        {editIsUsd ? formatUSD(editCalculatedUnitPrice) : formatBRL(editCalculatedUnitPrice)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--color-border)]/50">
                      <span className="text-xs text-[var(--color-text-muted)]">Total da operacao</span>
                      <span className="text-sm font-semibold text-[var(--color-text-secondary)]">
                        {editIsUsd ? formatUSD(editNativeTotal) : formatBRL(editBrlTotal)}
                      </span>
                    </div>
                    {editIsUsd && (
                      <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--color-border)]/50">
                        <span className="text-xs text-[var(--color-text-muted)]">Equivalente em BRL</span>
                        <span className="text-sm font-semibold text-[var(--color-text-secondary)]">{formatBRL(editBrlTotal)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={cancelEdit} className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm font-medium">Cancelar</button>
                  <button onClick={() => saveEdit(editingId)} disabled={saving} className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50">{saving ? "Salvando..." : "Salvar"}</button>
                </div>
              </div>
            </div>
          )}

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
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
                {purchases.map((p) => {
                  const isSale = p.quantity < 0;
                  return (
                  <tr key={p.id} className={`border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50 ${isSale ? "bg-[var(--color-negative)]/5" : ""}`}>
                    {editingId === p.id ? (
                      <>
                        <td className="px-3 py-1.5">
                          <input type="date" value={editData.purchase_date} onChange={(e) => setEditData({ ...editData, purchase_date: e.target.value })} className="w-full px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                        </td>
                        <td className="px-3 py-2.5 font-medium">
                          <div className="flex items-center gap-2">
                            <TickerLogo ticker={p.ticker!} type={p.asset_type!} size={20} />
                            {p.ticker}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{p.asset_type}</td>
                        <td className="px-3 py-1.5">
                          <input type="number" step="any" min="-999999999" value={editData.quantity} onChange={(e) => setEditData({ ...editData, quantity: e.target.value })} className="w-28 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="space-y-1.5">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[var(--color-text-muted)]">
                                {editIsUsd ? "US$" : "R$"}
                              </span>
                              <input type="number" step="0.01" value={editData.total_value} onChange={(e) => setEditData({ ...editData, total_value: e.target.value })} className="w-32 pl-8 pr-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                            </div>
                            {editIsUsd && (
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[var(--color-text-muted)]">FX</span>
                                <input type="number" step="0.0001" value={editData.fx_rate} onChange={(e) => setEditData({ ...editData, fx_rate: e.target.value })} className="w-28 pl-7 pr-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-xs" />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-[var(--color-text-muted)]">
                          <div className="leading-tight">
                            <div>{editIsUsd ? formatUSD(editCalculatedUnitPrice) : formatBRL(editCalculatedUnitPrice)}</div>
                            {editIsUsd && (
                              <div className="text-xs text-[var(--color-text-muted)]">{formatBRL(editCalculatedUnitPrice * (parseFloat(editData.fx_rate) || 0))}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-[var(--color-text-muted)] whitespace-nowrap">
                          <div className="leading-tight">
                            <div>{editIsUsd ? formatUSD(editNativeTotal) : formatBRL(editBrlTotal)}</div>
                            {editIsUsd && (
                              <div className="text-xs text-[var(--color-text-muted)]">{formatBRL(editBrlTotal)}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => saveEdit(p.id)} disabled={saving} className="text-xs text-[var(--color-positive)] hover:underline disabled:opacity-50">{saving ? "..." : "Salvar"}</button>
                            <button onClick={cancelEdit} className="text-xs text-[var(--color-text-muted)] hover:underline">Cancelar</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5">{new Date(p.purchase_date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                        <td className="px-3 py-2.5 font-medium">
                          <div className="flex items-center gap-2">
                            <TickerLogo ticker={p.ticker!} type={p.asset_type!} size={20} />
                            {p.ticker}
                            {isSale && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-negative)]/15 text-[var(--color-negative)]">VENDA</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                          <div className="flex items-center gap-1.5">
                            {p.asset_type}
                            {p.trade_currency === "USD" && (
                              <span className="text-[9px] font-semibold px-1 py-px rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">USD</span>
                            )}
                          </div>
                        </td>
                        <td className={`px-3 py-2.5 ${isSale ? "text-[var(--color-negative)]" : ""}`}>{formatQuantity(p.quantity)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{renderUnitPrice(p)}</td>
                        <td className={`px-3 py-2.5 font-medium whitespace-nowrap ${isSale ? "text-[var(--color-negative)]" : ""}`}>{renderTotalValue(p)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => startEdit(p)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors" title="Editar">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </button>
                            <button onClick={() => handleDelete(p.id)} className="text-[var(--color-text-muted)] hover:text-[var(--color-negative)] transition-colors" title="Remover">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
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

          <div className="mt-4 flex flex-col gap-3 border-t border-[var(--color-border)]/50 pt-4 md:flex-row md:items-center md:justify-between">
            <div className="text-xs text-[var(--color-text-muted)]">
              Exibindo {pageStart}-{pageEnd} de {totalCount} registros
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <span>Por página</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-main)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="min-w-24 text-center text-sm text-[var(--color-text-muted)]">
                  Página {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-main)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
