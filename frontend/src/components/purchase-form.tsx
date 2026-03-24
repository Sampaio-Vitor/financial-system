"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { Asset, PositionsResponse, PositionItem } from "@/types";
import { formatBRL } from "@/lib/format";
import { X, Search, ChevronDown } from "lucide-react";
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
  const [unitPrice, setUnitPrice] = useState("");
  const [search, setSearch] = useState("");
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
  const total =
    quantity && unitPrice ? parseFloat(quantity) * parseFloat(unitPrice) : 0;

  const handleSelectAsset = (asset: Asset) => {
    setAssetId(asset.id);
    setSearch(asset.ticker);
    setDropdownOpen(false);
    if (asset.current_price) {
      setUnitPrice(Number(asset.current_price).toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetId || !quantity || !unitPrice) return;

    const qty = parseFloat(quantity);
    if (isVenda && selectedPosition && qty > selectedPosition.quantity) {
      setError(`Quantidade excede a posicao atual (${selectedPosition.quantity})`);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await apiFetch("/purchases", {
        method: "POST",
        body: JSON.stringify({
          asset_id: assetId,
          purchase_date: date,
          quantity: isVenda ? -qty : qty,
          unit_price: parseFloat(unitPrice),
        }),
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
                      setUnitPrice("");
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
                            ? `${Number(ownedPositions.find((p) => p.asset_id === a.id)?.quantity ?? 0).toFixed(2)} cotas`
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
                Posicao atual: {Number(selectedPosition.quantity).toFixed(2)} cotas
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
                step="0.01"
                min="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
                {isVenda ? "Preco de Venda (R$)" : "Preco Unitario (R$)"}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                required
              />
            </div>
          </div>

          <div className="text-sm text-[var(--color-text-secondary)]">
            Total: <span className="font-bold text-[var(--color-text-primary)]">{formatBRL(total)}</span>
          </div>

          {error && <p className="text-sm text-[var(--color-negative)]">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !assetId}
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
