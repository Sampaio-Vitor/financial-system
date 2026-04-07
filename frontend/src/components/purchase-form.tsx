"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { Asset, PositionsResponse, PositionItem, PriceContextResponse } from "@/types";
import { formatBRL, formatQuantity, formatUSD } from "@/lib/format";
import { X, Search, ChevronDown, ArrowRightLeft } from "lucide-react";
import TickerLogo from "@/components/ticker-logo";

interface PurchaseFormProps {
  mode?: "compra" | "venda";
  onClose: () => void;
  onSaved: () => void;
}

export default function PurchaseForm({ mode = "compra", onClose, onSaved }: PurchaseFormProps) {
  const isVenda = mode === "venda";
  const [assets, setAssets] = useState<Asset[]>([]);
  const [ownedPositions, setOwnedPositions] = useState<PositionItem[]>([]);
  const [assetId, setAssetId] = useState<number | "">("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [quantity, setQuantity] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [search, setSearch] = useState("");
  const [priceContext, setPriceContext] = useState<PriceContextResponse>({
    usd_brl_rate: null,
    rate_updated_at: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isVenda) {
      // Fetch positions for all variable income classes
      Promise.all([
        apiFetch<PositionsResponse>("/portfolio/STOCK").catch(() => null),
        apiFetch<PositionsResponse>("/portfolio/ACAO").catch(() => null),
        apiFetch<PositionsResponse>("/portfolio/FII").catch(() => null),
      ]).then(([stocks, acoes, fiis]) => {
        const all: PositionItem[] = [];
        if (stocks) all.push(...stocks.positions);
        if (acoes) all.push(...acoes.positions);
        if (fiis) all.push(...fiis.positions);
        setOwnedPositions(all);
        // Also create Asset-like entries for the dropdown
        const assetList: Asset[] = all.map((p) => ({
          id: p.asset_id,
          ticker: p.ticker,
          type: p.type,
          description: p.description,
          paused: false,
          current_price: p.current_price,
          price_updated_at: null,
          created_at: "",
        }));
        setAssets(assetList);
      });
    } else {
      apiFetch<Asset[]>("/assets")
        .then((all) => setAssets(all.filter((a) => a.type !== "RF")))
        .catch(() => {});
    }
  }, [isVenda]);

  useEffect(() => {
    apiFetch<PriceContextResponse>("/prices/context")
      .then((data) => setPriceContext(data))
      .catch(() => {});
  }, []);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredAssets = assets.filter(
    (a) =>
      a.ticker.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase())
  );

  const selectedAsset = assets.find((a) => a.id === assetId);
  const selectedPosition = ownedPositions.find((p) => p.asset_id === assetId);
  const isUsdTrade = selectedAsset?.type === "STOCK";
  const usdBrlRate = priceContext.usd_brl_rate;
  const parsedQuantity = parseFloat(quantity);
  const parsedTotalAmount = parseFloat(totalAmount);
  const hasValidInputs =
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0 &&
    Number.isFinite(parsedTotalAmount) &&
    parsedTotalAmount > 0;
  const derivedUnitPrice = hasValidInputs ? parsedTotalAmount / parsedQuantity : 0;
  const totalNative = hasValidInputs ? parsedTotalAmount : 0;
  const totalBrl = isUsdTrade && usdBrlRate ? totalNative * usdBrlRate : totalNative;
  const unitPriceBrl =
    isUsdTrade && hasValidInputs && usdBrlRate ? derivedUnitPrice * usdBrlRate : null;
  const rateUpdatedLabel = priceContext.rate_updated_at
    ? new Date(priceContext.rate_updated_at).toLocaleString("pt-BR", {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
    : null;

  const handleSelectAsset = (asset: Asset) => {
    setAssetId(asset.id);
    setSearch(asset.ticker);
    setDropdownOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetId || !hasValidInputs) return;

    const qty = parsedQuantity;
    if (isVenda && selectedPosition && qty > selectedPosition.quantity) {
      setError(`Quantidade excede a posicao atual (${formatQuantity(selectedPosition.quantity)})`);
      return;
    }
    if (isUsdTrade && (!usdBrlRate || usdBrlRate <= 0)) {
      setError("Cotacao USD/BRL indisponivel. Atualize os precos antes de registrar.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        asset_id: assetId,
        purchase_date: date,
        quantity: isVenda ? -qty : qty,
        ...(isUsdTrade
          ? {
              trade_currency: "USD" as const,
              unit_price_native: derivedUnitPrice,
              fx_rate: usdBrlRate,
            }
          : {
              unit_price: derivedUnitPrice,
            }),
      };
      await apiFetch("/purchases", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            {isVenda ? "Registrar Venda" : "Registrar Aporte"}
          </h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div ref={dropdownRef}>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Ativo</label>
            <div className="relative">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  placeholder="Buscar por ticker ou nome..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setDropdownOpen(true);
                    if (!e.target.value) {
                      setAssetId("");
                    }
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  className="w-full pl-9 pr-8 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                />
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              </div>
              {dropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredAssets.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-[var(--color-text-muted)] text-center">
                      Nenhum ativo encontrado
                    </div>
                  ) : (
                    filteredAssets.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleSelectAsset(a)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--color-bg-main)] transition-colors ${
                          assetId === a.id ? "bg-[var(--color-accent)]/10" : ""
                        }`}
                      >
                        <TickerLogo ticker={a.ticker} type={a.type} size={20} />
                        <span className="font-medium">{a.ticker}</span>
                        <span className="text-[var(--color-text-muted)] text-xs truncate">
                          {isVenda
                            ? `${formatQuantity(ownedPositions.find((p) => p.asset_id === a.id)?.quantity ?? 0)} cotas`
                            : a.description}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {isVenda && selectedPosition && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Posicao atual: {formatQuantity(selectedPosition.quantity)} cotas
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Quantidade</label>
              <input
                type="number"
                step="any"
                min="0.00000001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                {isVenda ? "Valor Total da Venda" : "Valor Total Investido"}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--color-text-muted)]">
                  {isUsdTrade ? "US$" : "R$"}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                  required
                />
              </div>
            </div>
          </div>

          {isUsdTrade && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ArrowRightLeft size={12} className="text-[var(--color-accent)]" />
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">Conversao Cambial</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div className="text-[var(--color-text-muted)]">Cambio USD/BRL</div>
                <div className="text-right font-medium text-[var(--color-text-primary)]">
                  {usdBrlRate ? `R$ ${usdBrlRate.toFixed(4)}` : "indisponivel"}
                </div>
                {unitPriceBrl !== null && (
                  <>
                    <div className="text-[var(--color-text-muted)]">Preco unitario em BRL</div>
                    <div className="text-right font-medium text-[var(--color-text-primary)]">{formatBRL(unitPriceBrl)}</div>
                  </>
                )}
                {rateUpdatedLabel && (
                  <>
                    <div className="text-[var(--color-text-muted)]">Atualizado em</div>
                    <div className="text-right text-[var(--color-text-muted)]">{rateUpdatedLabel}</div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-muted)]">Preco unitario calculado</span>
              <span className="text-base font-bold text-[var(--color-text-primary)]">
                {isUsdTrade ? formatUSD(derivedUnitPrice) : formatBRL(derivedUnitPrice)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--color-border)]/50">
              <span className="text-xs text-[var(--color-text-muted)]">Total da operacao</span>
              <span className="text-sm font-semibold text-[var(--color-text-secondary)]">
                {isUsdTrade ? formatUSD(totalNative) : formatBRL(totalBrl)}
              </span>
            </div>
            {isUsdTrade && (
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--color-border)]/50">
                <span className="text-xs text-[var(--color-text-muted)]">Equivalente em BRL</span>
                <span className="text-sm font-semibold text-[var(--color-text-secondary)]">{formatBRL(totalBrl)}</span>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-[var(--color-negative)]">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !assetId || !hasValidInputs || (isUsdTrade && !usdBrlRate)}
            className={`w-full py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity ${
              isVenda
                ? "bg-[var(--color-negative)] text-white"
                : "bg-[var(--color-accent)] text-white"
            }`}
          >
            {submitting
              ? "Salvando..."
              : isVenda
                ? "Registrar Venda"
                : "Registrar Aporte"}
          </button>
        </form>
      </div>
    </div>
  );
}
