"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Asset, AssetType } from "@/types";
import { X } from "lucide-react";

interface AssetFormProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function AssetForm({ onClose, onSaved }: AssetFormProps) {
  const [ticker, setTicker] = useState("");
  const [type, setType] = useState<AssetType>("STOCK");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdAsset, setCreatedAsset] = useState<Asset | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const asset = await apiFetch<Asset>("/assets", {
        method: "POST",
        body: JSON.stringify({
          ticker: ticker.toUpperCase(),
          type,
          description,
        }),
      });
      setCreatedAsset(asset);
      setTimeout(onSaved, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar ativo");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Adicionar Ativo</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={20} />
          </button>
        </div>

        {createdAsset ? (
          <div className="text-center py-4">
            <p className="text-[var(--color-positive)] font-medium mb-1">
              {createdAsset.ticker} adicionado!
            </p>
            {createdAsset.current_price && (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Cotacao: R$ {createdAsset.current_price}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Ticker</label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="Ex: AAPL, PETR3, HGLG11"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AssetType)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
              >
                <option value="STOCK">Stock (EUA)</option>
                <option value="ACAO">Acao (Brasil)</option>
                <option value="FII">FII</option>
                <option value="RF">Renda Fixa</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Descricao</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Nome da empresa ou descricao"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
              />
            </div>

            {error && <p className="text-sm text-[var(--color-negative)]">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Adicionando..." : "Adicionar Ativo"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
