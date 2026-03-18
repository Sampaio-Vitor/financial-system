"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Asset } from "@/types";
import { X } from "lucide-react";

interface PurchaseFormProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function PurchaseForm({ onClose, onSaved }: PurchaseFormProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState<number | "">("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Asset[]>("/assets").then(setAssets).catch(() => {});
  }, []);

  const filteredAssets = assets.filter(
    (a) =>
      a.ticker.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase())
  );

  const selectedAsset = assets.find((a) => a.id === assetId);
  const total =
    quantity && unitPrice ? (parseFloat(quantity) * parseFloat(unitPrice)).toFixed(2) : "0.00";

  const handleSelectAsset = (asset: Asset) => {
    setAssetId(asset.id);
    setSearch(asset.ticker);
    if (asset.current_price) {
      setUnitPrice(asset.current_price.toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetId || !quantity || !unitPrice) return;

    setSubmitting(true);
    setError("");

    try {
      await apiFetch("/purchases", {
        method: "POST",
        body: JSON.stringify({
          asset_id: assetId,
          purchase_date: date,
          quantity: parseFloat(quantity),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Registrar Aporte</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Ativo</label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setAssetId("");
              }}
              placeholder="Buscar por ticker ou nome..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
            />
            {search && !selectedAsset && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)]">
                {filteredAssets.slice(0, 10).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSelectAsset(a)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-bg-card)] flex justify-between"
                  >
                    <span className="font-medium">{a.ticker}</span>
                    <span className="text-[var(--color-text-muted)]">{a.description}</span>
                  </button>
                ))}
              </div>
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
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Preco Unitario (R$)</label>
              <input
                type="number"
                step="any"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                required
              />
            </div>
          </div>

          <div className="text-sm text-[var(--color-text-secondary)]">
            Total: <span className="font-bold text-[var(--color-text-primary)]">R$ {total}</span>
          </div>

          {error && <p className="text-sm text-[var(--color-negative)]">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !assetId}
            className="w-full py-2 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Salvando..." : "Registrar Aporte"}
          </button>
        </form>
      </div>
    </div>
  );
}
