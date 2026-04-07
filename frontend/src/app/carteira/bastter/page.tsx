"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  RefreshCcw,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  Send,
  Filter,
  Clock,
} from "lucide-react";
import TickerLogo from "@/components/ticker-logo";
import { apiFetch } from "@/lib/api";
import { formatBRL, formatQuantity, formatUSD } from "@/lib/format";
import type {
  AssetType,
  BastterSyncBatchResponse,
  BastterSyncItemResult,
  BastterSyncPreviewItem,
  BastterSyncPreviewResponse,
} from "@/types";

const SUPPORTED_TYPES: AssetType[] = ["ACAO", "FII", "STOCK"];
const TYPE_LABELS: Record<AssetType, string> = {
  ACAO: "Acoes",
  FII: "FIIs",
  STOCK: "Stocks",
  RF: "Renda Fixa",
};

type TypeFilter = "" | AssetType;
type SortKey = "ticker" | "asset_type" | "purchase_date" | "quantity" | "total_value" | "bastter_synced_at";
type SortDir = "asc" | "desc";

export default function BastterSyncPage() {
  const [items, setItems] = useState<BastterSyncPreviewItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [cookie, setCookie] = useState("");
  const [showCookie, setShowCookie] = useState(false);
  const [results, setResults] = useState<BastterSyncItemResult[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filterType, setFilterType] = useState<TypeFilter>("");
  const [filterTicker, setFilterTicker] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<SortKey | "">("");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [summary, setSummary] = useState<BastterSyncBatchResponse | null>(null);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);
  const lastFiltersKey = useRef("");
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);

  const filtersKey = `${filterType}|${filterTicker}|${filterDateFrom}|${filterDateTo}`;
  const hasActiveFilters = filterType !== "" || filterTicker !== "" || filterDateFrom !== "" || filterDateTo !== "";
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const selectableItems = items.filter((item) => !item.bastter_synced_at);
  const allCurrentPageSelected =
    selectableItems.length > 0 && selectableItems.every((item) => selectedIds.includes(item.id));

  useEffect(() => {
    const filtersChanged = lastFiltersKey.current !== filtersKey;
    if (filtersChanged) {
      lastFiltersKey.current = filtersKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }

    const controller = new AbortController();
    const fetchItems = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
        });
        if (filterType) params.set("asset_type", filterType);
        if (filterTicker.trim()) params.set("ticker", filterTicker.trim());
        if (filterDateFrom) params.set("date_from", filterDateFrom);
        if (filterDateTo) params.set("date_to", filterDateTo);
        if (sortBy) {
          params.set("sort_by", sortBy);
          params.set("sort_dir", sortDir);
        }

        const response = await apiFetch<BastterSyncPreviewResponse>(`/bastter/purchases?${params.toString()}`, {
          signal: controller.signal,
        });

        const normalizedItems = response.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          total_value: Number(item.total_value),
          total_value_native: Number(item.total_value_native),
        }));
        setItems(normalizedItems);
        setTotalCount(response.total_count);
        setSelectedIds((current) =>
          current.filter((id) => normalizedItems.some((item) => item.id === id && !item.bastter_synced_at))
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setItems([]);
        setTotalCount(0);
        toast.error(error instanceof Error ? error.message : "Erro ao carregar movimentacoes");
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
    return () => controller.abort();
  }, [filterDateFrom, filterDateTo, filterTicker, filterType, filtersKey, page, pageSize, sortBy, sortDir]);

  const toggleSelection = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const toggleCurrentPage = () => {
    if (allCurrentPageSelected) {
      setSelectedIds((current) => current.filter((id) => !selectableItems.some((item) => item.id === id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...selectableItems.map((item) => item.id)])));
  };

  const clearFilters = () => {
    setFilterType("");
    setFilterTicker("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(1);
  };

  const handleSync = async () => {
    if (!selectedIds.length) {
      toast.error("Selecione ao menos uma movimentacao");
      return;
    }
    if (!cookie.trim()) {
      toast.error("Cole o cookie da sessao do Bastter");
      setShowCookie(true);
      return;
    }

    setSyncing(true);
    try {
      const response = await apiFetch<BastterSyncBatchResponse>("/bastter/sync", {
        method: "POST",
        body: JSON.stringify({
          purchase_ids: selectedIds,
          cookie,
        }),
      });

      setSummary(response);
      setResults(response.results);
      setCookie("");
      setSelectedIds([]);
      toast.success(
        response.failure_count === 0
          ? `${response.success_count} movimentacao(oes) sincronizada(s)`
          : `${response.success_count} sincronizada(s), ${response.failure_count} com erro`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao sincronizar com Bastter");
    } finally {
      setSyncing(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      if (sortDir === "desc") setSortDir("asc");
      else { setSortBy(""); setSortDir("desc"); }
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
    setPage(1);
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <th
      onClick={() => toggleSort(sortKey)}
      className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] cursor-pointer select-none hover:text-[var(--color-text-secondary)] transition-colors"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortBy === sortKey ? (
          sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
        ) : (
          <ArrowUpDown size={12} className="opacity-30" />
        )}
      </span>
    </th>
  );

  const renderTotal = (item: BastterSyncPreviewItem) => {
    if (item.asset_type === "STOCK") {
      return (
        <>
          <span>{formatUSD(item.total_value_native)}</span>
          <span className="text-[10px] text-[var(--color-text-muted)] ml-1">({formatBRL(item.total_value)})</span>
        </>
      );
    }
    return formatBRL(item.total_value);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Sync Bastter</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Sincronize compras locais com o Bastter
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCookie(!showCookie)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs md:text-sm font-medium transition-all ${
              cookie.trim()
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-amber-300 bg-amber-50 text-amber-700"
            }`}
          >
            {cookie.trim() ? (
              <CheckCircle2 size={16} />
            ) : (
              <Clock size={16} />
            )}
            {cookie.trim() ? "Cookie configurado" : "Configurar cookie"}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || loading || !selectedIds.length}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-xs md:text-sm font-medium hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? (
              <RefreshCcw size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {syncing ? "Sincronizando..." : `Sincronizar${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
          </button>
        </div>
      </div>

      {/* Cookie input (collapsible) */}
      {showCookie && (
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4 mb-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="bastter-cookie" className="text-sm font-medium text-[var(--color-text-primary)]">
              Cookie da sessao do Bastter
            </label>
            <button onClick={() => setShowCookie(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
              <X size={16} />
            </button>
          </div>
          <textarea
            id="bastter-cookie"
            value={cookie}
            onChange={(event) => setCookie(event.target.value)}
            placeholder="SessionV3=...; ASP.NET_SessionId=...;"
            rows={3}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]"
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-2">
            DevTools &gt; Network &gt; qualquer request do Bastter &gt; Headers &gt; copie o valor de <span className="font-medium">Cookie</span>. Nao fica salvo.
          </p>
        </div>
      )}

      {/* Filters */}
      {!loading && (totalCount > 0 || hasActiveFilters) && (
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--color-text-muted)]">Tipo</label>
              <select
                value={filterType}
                onChange={(event) => setFilterType(event.target.value as TypeFilter)}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm w-full"
              >
                <option value="">Todos</option>
                {SUPPORTED_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--color-text-muted)]">Ticker</label>
              <input
                value={filterTicker}
                onChange={(event) => setFilterTicker(event.target.value)}
                placeholder="Buscar ticker..."
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm w-full"
              />
            </div>
            <div className="flex flex-col gap-1 cursor-pointer" onClick={() => dateFromRef.current?.showPicker()}>
              <label className="text-xs text-[var(--color-text-muted)]">De</label>
              <input
                ref={dateFromRef}
                type="date"
                value={filterDateFrom}
                onChange={(event) => setFilterDateFrom(event.target.value)}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm w-full cursor-pointer"
              />
            </div>
            <div className="flex flex-col gap-1 cursor-pointer" onClick={() => dateToRef.current?.showPicker()}>
              <label className="text-xs text-[var(--color-text-muted)]">Ate</label>
              <input
                ref={dateToRef}
                type="date"
                value={filterDateTo}
                onChange={(event) => setFilterDateTo(event.target.value)}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm w-full cursor-pointer"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--color-text-muted)]">Itens/pagina</label>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm w-full"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border)]/50 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <div className="flex items-center gap-3">
              <span>{totalCount} compra(s) encontrada(s)</span>
              {selectedIds.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] px-2 py-0.5 text-[11px] font-medium">
                  {selectedIds.length} selecionada(s)
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {selectedIds.length > 0 && (
                <button
                  onClick={() => setSelectedIds([])}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                >
                  Limpar selecao
                </button>
              )}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                >
                  <Filter size={12} />
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)]">
        {loading ? (
          <div className="animate-pulse h-64" />
        ) : totalCount === 0 && !hasActiveFilters ? (
          <p className="text-[var(--color-text-muted)] text-center py-12 text-sm">
            Nenhuma compra elegivel para sincronizacao.
          </p>
        ) : totalCount === 0 ? (
          <p className="text-[var(--color-text-muted)] text-center py-12 text-sm">
            Nenhum resultado para os filtros selecionados.
          </p>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="md:hidden p-3 space-y-2">
              {/* Select all toggle */}
              <button
                onClick={toggleCurrentPage}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]"
              >
                <span>{allCurrentPageSelected ? "Desmarcar todos" : "Selecionar todos desta pagina"}</span>
                <input
                  type="checkbox"
                  checked={allCurrentPageSelected}
                  readOnly
                  className="pointer-events-none"
                />
              </button>

              {items.map((item) => {
                const synced = !!item.bastter_synced_at;
                const selected = selectedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => !synced && toggleSelection(item.id)}
                    className={`rounded-xl border p-4 transition-all cursor-pointer ${
                      synced
                        ? "border-emerald-200 bg-emerald-50/50 opacity-60 cursor-default"
                        : selected
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                        : "border-[var(--color-border)] bg-[var(--color-bg-main)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          disabled={synced}
                          checked={selected}
                          readOnly
                          className="pointer-events-none shrink-0"
                        />
                        <TickerLogo ticker={item.ticker} type={item.asset_type} size={20} />
                        <span className="font-medium text-sm">{item.ticker}</span>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-bg-card)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                          {TYPE_LABELS[item.asset_type]}
                        </span>
                      </div>
                      {synced && (
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                      <div>
                        <span className="text-xs text-[var(--color-text-muted)]">Data</span>
                        <div className="text-sm text-[var(--color-text-secondary)]">
                          {new Date(`${item.purchase_date}T00:00:00`).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--color-text-muted)]">Total</span>
                        <div className="text-sm font-medium text-[var(--color-text-secondary)] flex flex-wrap items-baseline gap-x-1">
                          {renderTotal(item)}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--color-text-muted)]">Qtd</span>
                        <div className="text-sm text-[var(--color-text-secondary)]">
                          {formatQuantity(item.quantity)}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--color-text-muted)]">Status</span>
                        <div className="text-sm">
                          {synced ? (
                            <span className="text-emerald-600 text-xs">Sincronizada</span>
                          ) : (
                            <span className="text-[var(--color-text-muted)] text-xs">Pendente</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 text-left w-10">
                      <input
                        type="checkbox"
                        checked={allCurrentPageSelected}
                        onChange={toggleCurrentPage}
                        aria-label="Selecionar pagina atual"
                      />
                    </th>
                    <SortHeader label="Ativo" sortKey="ticker" />
                    <SortHeader label="Tipo" sortKey="asset_type" />
                    <SortHeader label="Data" sortKey="purchase_date" />
                    <SortHeader label="Qtd" sortKey="quantity" />
                    <SortHeader label="Total" sortKey="total_value" />
                    <th
                      onClick={() => toggleSort("bastter_synced_at")}
                      className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-muted)] cursor-pointer select-none hover:text-[var(--color-text-secondary)] transition-colors"
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        Status
                        {sortBy === "bastter_synced_at" ? (
                          sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} className="opacity-30" />
                        )}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const synced = !!item.bastter_synced_at;
                    const selected = selectedIds.includes(item.id);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => !synced && toggleSelection(item.id)}
                        className={`border-b border-[var(--color-border)] last:border-b-0 transition-colors cursor-pointer ${
                          synced
                            ? "opacity-50 cursor-default"
                            : selected
                            ? "bg-[var(--color-accent)]/5"
                            : "hover:bg-[var(--color-bg-main)]/50"
                        }`}
                      >
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            disabled={synced}
                            checked={selected}
                            onChange={() => toggleSelection(item.id)}
                            aria-label={`Selecionar ${item.ticker}`}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <TickerLogo ticker={item.ticker} type={item.asset_type} size={24} />
                            <span className="font-medium text-[var(--color-text-primary)]">{item.ticker}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-muted)]">
                            {TYPE_LABELS[item.asset_type]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                          {new Date(`${item.purchase_date}T00:00:00`).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                          {formatQuantity(item.quantity)}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)] flex items-baseline gap-x-1">
                          {renderTotal(item)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {synced ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                              <CheckCircle2 size={13} />
                              Sync {new Date(item.bastter_synced_at!).toLocaleDateString("pt-BR")}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--color-text-muted)]">Pendente</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="border-t border-[var(--color-border)] px-4 py-3 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
              <span>Pagina {page} de {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs hover:bg-[var(--color-bg-main)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs hover:bg-[var(--color-bg-main)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  Proxima
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sync Results */}
      {(summary || results.length > 0) && (
        <div className="mt-4 bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)]">
          {/* Results header */}
          <div className="p-4 border-b border-[var(--color-border)] flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">Resultado do Sync</h2>
              {summary && (
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {summary.catalog_items_count} itens no catalogo Bastter
                </p>
              )}
            </div>
            {summary && (
              <div className="flex gap-3">
                <div className="flex items-center gap-1.5 text-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[var(--color-text-secondary)]">{summary.success_count} sucesso(s)</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-[var(--color-text-secondary)]">{summary.failure_count} falha(s)</span>
                </div>
              </div>
            )}
          </div>

          {/* Results list */}
          <div className="divide-y divide-[var(--color-border)]">
            {results.map((result, index) => {
              const isExpanded = expandedResult === index;
              return (
                <div key={`${result.purchase_id}-${result.endpoint ?? index}`}>
                  <button
                    onClick={() => setExpandedResult(isExpanded ? null : index)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[var(--color-bg-main)]/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {result.success ? (
                        <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle size={18} className="text-rose-500 shrink-0" />
                      )}
                      <div>
                        <span className="font-medium text-sm text-[var(--color-text-primary)]">{result.ticker}</span>
                        <span className="text-xs text-[var(--color-text-muted)] ml-2">{result.local_type}</span>
                      </div>
                      {result.error && (
                        <span className="text-xs text-rose-500 hidden md:inline">{result.error}</span>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={16} className="text-[var(--color-text-muted)]" />}
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 bg-[var(--color-bg-main)]/30">
                      <div className="grid gap-2 text-sm text-[var(--color-text-secondary)] md:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--color-text-muted)]">Tipo Bastter:</span>
                          <span className="text-xs font-medium">{result.bastter_tipo}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--color-text-muted)]">AtivoID:</span>
                          <span className="text-xs font-medium">{result.ativo_id ?? "—"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--color-text-muted)]">Endpoint:</span>
                          <span className="text-xs font-mono">{result.endpoint ?? "—"}</span>
                        </div>
                        {result.error && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--color-text-muted)]">Erro:</span>
                            <span className="text-xs font-medium text-rose-500">{result.error}</span>
                          </div>
                        )}
                        {result.bastter_synced_at && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--color-text-muted)]">Sync em:</span>
                            <span className="text-xs font-medium">{new Date(result.bastter_synced_at).toLocaleString("pt-BR")}</span>
                          </div>
                        )}
                      </div>
                      {result.bastter_response && (
                        <pre className="mt-3 overflow-x-auto rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] p-3 text-[11px] font-mono text-[var(--color-text-muted)]">
                          {JSON.stringify(result.bastter_response, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
