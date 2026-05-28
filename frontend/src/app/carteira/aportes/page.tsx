"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-modal";
import { apiFetch } from "@/lib/api";
import { AssetType, CurrencyCode, Purchase, PurchasePageResponse } from "@/types";
import { formatBRL, formatCurrency, formatEditableNumber, formatQuantity } from "@/lib/format";
import PurchaseForm from "@/components/purchase-form";
import OcrImportModal from "@/components/ocr-import-modal";
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

function isForeignCurrency(currency: CurrencyCode): boolean {
  return currency !== "BRL";
}

const TYPE_LABELS: Record<string, string> = {
  ACAO: "AÇÃO",
  FII: "FII",
  STOCK: "STOCK",
  RF: "RF",
};

export default function AportesPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showOcrImport, setShowOcrImport] = useState(false);
  const [formMode, setFormMode] = useState<"compra" | "venda">("compra");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{
    purchase_date: string;
    quantity: string;
    total_value: string;
    trade_currency: CurrencyCode;
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
  const [pageSize, setPageSize] = useState(15);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
        isForeignCurrency(p.trade_currency) ? p.total_value_native : p.total_value
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
        const isForeignTrade = isForeignCurrency(editData.trade_currency);
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
            ...(isForeignTrade
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
    if (isForeignCurrency(p.trade_currency)) {
      return (
        <>
          <span>{formatCurrency(p.unit_price_native, p.trade_currency)}</span>
          <span className="text-[10px] text-[var(--color-text-muted)] ml-1">({formatBRL(p.unit_price)})</span>
        </>
      );
    }
    return formatBRL(p.unit_price);
  };

  const renderTotalValue = (p: Purchase) => {
    if (isForeignCurrency(p.trade_currency)) {
      return (
        <>
          <span>{formatBRL(p.total_value)}</span>
          <span className="text-[10px] text-[var(--color-text-muted)] ml-1">({formatCurrency(p.total_value_native, p.trade_currency)})</span>
        </>
      );
    }
    return formatBRL(p.total_value);
  };

  const editIsForeign = isForeignCurrency(editData.trade_currency);
  const editNativeTotal = parseFloat(editData.total_value) || 0;
  const editBrlTotal = editIsForeign
    ? editNativeTotal * (parseFloat(editData.fx_rate) || 0)
    : editNativeTotal;
  const editCalculatedUnitPrice = calculateUnitPrice(editData.total_value, editData.quantity) || 0;

  return (
    <div className="flex min-h-0 flex-col md:h-[calc(100dvh-4rem)]">
      <ConfirmDialog />
      <div className="mb-3 flex shrink-0 flex-col gap-2 md:mb-4 md:flex-row md:items-center md:justify-between md:gap-3">
        <h1 className="text-lg font-bold md:text-xl">Aportes em Renda Variavel</h1>
        <div className="grid grid-cols-3 gap-2 md:flex">
          <button
            onClick={() => setShowOcrImport(true)}
            className="min-h-10 rounded-lg border border-[var(--color-accent)] px-2 py-2 text-[11px] font-medium leading-tight text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/10 md:flex-none md:px-4 md:text-sm"
          >
            <span className="md:hidden">Importar</span>
            <span className="hidden md:inline">Importar via Imagem</span>
          </button>
          <button
            onClick={() => { setFormMode("compra"); setShowForm(true); }}
            className="min-h-10 rounded-lg bg-[var(--color-accent)] px-2 py-2 text-[11px] font-medium leading-tight text-white transition-opacity hover:opacity-90 md:flex-none md:px-4 md:text-sm"
          >
            <span className="md:hidden">Aporte</span>
            <span className="hidden md:inline">Registrar Aporte</span>
          </button>
          <button
            onClick={() => { setFormMode("venda"); setShowForm(true); }}
            className="min-h-10 rounded-lg bg-[var(--color-negative)] px-2 py-2 text-[11px] font-medium leading-tight text-white transition-opacity hover:opacity-90 md:flex-none md:px-4 md:text-sm"
          >
            <span className="md:hidden">Venda</span>
            <span className="hidden md:inline">Registrar Venda</span>
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

      {showOcrImport && (
        <OcrImportModal
          onClose={() => setShowOcrImport(false)}
          onSaved={() => {
            setShowOcrImport(false);
            refreshPurchases();
          }}
        />
      )}

      {/* Filters */}
      {!loading && (totalCount > 0 || hasActiveFilters) && (
        <div className="mb-2 shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 md:mb-3 md:p-4">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 text-left md:hidden"
          >
            <span>
              <span className="block text-sm font-semibold text-[var(--color-text-primary)]">Filtros</span>
              <span className="text-xs text-[var(--color-text-muted)]">{totalCount} registros encontrados</span>
            </span>
            <span className="text-xs font-medium text-[var(--color-accent)]">
              {mobileFiltersOpen ? "Ocultar" : hasActiveFilters ? "Editar" : "Mostrar"}
            </span>
          </button>
          <div className={`${mobileFiltersOpen ? "grid" : "hidden"} mt-3 grid-cols-2 gap-2 md:mt-0 md:grid md:grid-cols-3 md:gap-3 lg:grid-cols-5`}>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--color-text-muted)]">Tipo</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as AssetType | "")}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm w-full"
              >
                <option value="">Todos</option>
                <option value="ACAO">Acoes</option>
                <option value="STOCK">Stocks</option>
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
            <div className={`${mobileFiltersOpen ? "flex" : "hidden"} mt-3 items-center justify-between border-t border-[var(--color-border)]/50 pt-3 text-xs text-[var(--color-text-muted)] md:flex`}>
              <div className="hidden md:block">{totalCount} registros encontrados</div>
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

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 md:p-4">
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
          <div className="mb-2 flex shrink-0 items-center justify-between gap-3 md:mb-3 md:justify-end">
            <div className="text-xs text-[var(--color-text-muted)] md:hidden">
              {pageStart}-{pageEnd} de {totalCount}
            </div>
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
          <div className="min-h-0 flex-1 space-y-1.5 overflow-auto md:hidden">
            {purchases.map((p) => {
              const isSale = p.quantity < 0;
              return (
                <div key={p.id} className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-2.5 ${isSale ? "border-[var(--color-negative)]/30" : ""}`}>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                      <TickerLogo ticker={p.ticker!} type={p.asset_type!} assetClass={p.asset_class} market={p.market} size={20} />
                        <span className="truncate text-sm font-semibold">{p.ticker}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          {TYPE_LABELS[p.asset_type!] || p.asset_type || p.asset_class}
                        </span>
                      {isForeignCurrency(p.trade_currency) && (
                        <span className="text-[9px] font-semibold px-1 py-px rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">{p.trade_currency}</span>
                      )}
                      {isSale && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-negative)]/15 text-[var(--color-negative)]">
                          VENDA
                        </span>
                      )}
                      </div>
                      <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {new Date(p.purchase_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <div className={`text-right text-sm font-semibold ${isSale ? "text-[var(--color-negative)]" : "text-[var(--color-text-primary)]"}`}>
                      {renderTotalValue(p)}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2 border-t border-[var(--color-border)]/50 pt-2">
                    <div>
                      <span className="text-[10px] uppercase text-[var(--color-text-muted)]">Qtd</span>
                      <div className={`text-sm leading-tight ${isSale ? "text-[var(--color-negative)]" : "text-[var(--color-text-secondary)]"}`}>
                        {formatQuantity(p.quantity)}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase text-[var(--color-text-muted)]">Unit.</span>
                      <div className="flex flex-wrap items-baseline gap-x-1 text-sm leading-tight text-[var(--color-text-secondary)]">{renderUnitPrice(p)}</div>
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-1">
                      <button
                        onClick={() => startEdit(p)}
                        className="flex size-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
                        aria-label={`Editar ${p.ticker}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="flex size-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-negative)]"
                        aria-label={`Remover ${p.ticker}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
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
                        {isForeignCurrency(editData.trade_currency)
                          ? `Valor Total (${editData.trade_currency})`
                          : "Valor Total (R$)"}
                      </label>
                      <input type="number" step="0.01" value={editData.total_value} onChange={(e) => setEditData({ ...editData, total_value: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                    </div>
                  </div>
                  {editIsForeign && (
                    <div>
                      <label className="text-xs text-[var(--color-text-muted)] mb-1 block">
                        Cambio {editData.trade_currency}/BRL
                      </label>
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
                        {formatCurrency(editCalculatedUnitPrice, editData.trade_currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--color-border)]/50">
                      <span className="text-xs text-[var(--color-text-muted)]">Total da operacao</span>
                      <span className="text-sm font-semibold text-[var(--color-text-secondary)]">
                        {formatCurrency(editNativeTotal, editData.trade_currency)}
                      </span>
                    </div>
                    {editIsForeign && (
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
          <div className="hidden md:flex md:flex-col min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-bg-card)] z-10">
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Data</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Ticker</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Tipo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Qtd</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Preco Unit.</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Total</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-muted)]">Ações</th>
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
                            <TickerLogo ticker={p.ticker!} type={p.asset_type!} assetClass={p.asset_class} market={p.market} size={20} />
                            {p.ticker}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{TYPE_LABELS[p.asset_type!] || p.asset_type || p.asset_class}</td>
                        <td className="px-3 py-1.5">
                          <input type="number" step="any" min="-999999999" value={editData.quantity} onChange={(e) => setEditData({ ...editData, quantity: e.target.value })} className="w-28 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="space-y-1.5">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[var(--color-text-muted)]">
                                {editData.trade_currency}
                              </span>
                              <input type="number" step="0.01" value={editData.total_value} onChange={(e) => setEditData({ ...editData, total_value: e.target.value })} className="w-32 pl-8 pr-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm" />
                            </div>
                            {editIsForeign && (
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[var(--color-text-muted)]">FX</span>
                                <input type="number" step="0.0001" value={editData.fx_rate} onChange={(e) => setEditData({ ...editData, fx_rate: e.target.value })} className="w-28 pl-7 pr-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-xs" />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-[var(--color-text-muted)]">
                          <div className="leading-tight">
                            <div>{formatCurrency(editCalculatedUnitPrice, editData.trade_currency)}</div>
                            {editIsForeign && (
                              <div className="text-xs text-[var(--color-text-muted)]">{formatBRL(editCalculatedUnitPrice * (parseFloat(editData.fx_rate) || 0))}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-[var(--color-text-muted)] whitespace-nowrap">
                          <div className="leading-tight">
                            <div>{formatCurrency(editNativeTotal, editData.trade_currency)}</div>
                            {editIsForeign && (
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
                            <TickerLogo ticker={p.ticker!} type={p.asset_type!} assetClass={p.asset_class} market={p.market} size={20} />
                            {p.ticker}
                            {isSale && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-negative)]/15 text-[var(--color-negative)]">VENDA</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                          <div className="flex items-center gap-1.5">
                            {TYPE_LABELS[p.asset_type!] || p.asset_type || p.asset_class}
                            {isForeignCurrency(p.trade_currency) && (
                              <span className="text-[9px] font-semibold px-1 py-px rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">{p.trade_currency}</span>
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

          <div className="mt-3 flex shrink-0 flex-col gap-3 border-t border-[var(--color-border)]/50 pt-3 md:flex-row md:items-center md:justify-between">
            <div className="hidden text-xs text-[var(--color-text-muted)] md:block">
              Exibindo {pageStart}-{pageEnd} de {totalCount} registros
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center justify-between gap-2 text-xs text-[var(--color-text-muted)] sm:justify-start">
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
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-main)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="min-w-20 text-center text-sm text-[var(--color-text-muted)] md:min-w-24">
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
