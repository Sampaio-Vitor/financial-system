"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Asset } from "@/types";

interface AporteModalProps {
  open: boolean;
  rfAssets: Asset[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AporteModal({ open, rfAssets, onClose, onSaved }: AporteModalProps) {
  const [assetId, setAssetId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [value, setValue] = useState("");
  const [maturity, setMaturity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!assetId || !description || !value) return;
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) return;

    setSubmitting(true);
    try {
      await apiFetch("/fixed-income", {
        method: "POST",
        body: JSON.stringify({
          asset_id: assetId,
          description,
          start_date: date,
          applied_value: parsed,
          current_balance: parsed,
          maturity_date: maturity || null,
        }),
      });
      onClose();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar aporte");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold mb-4">Registrar Aporte em RF</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Tipo</label>
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
            >
              <option value="">Selecione o tipo</option>
              {rfAssets.map((a) => (
                <option key={a.id} value={a.id}>{a.ticker} — {a.description}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Descricao</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: LCI Banco X 12 meses"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Data da Aplicacao</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Valor Aplicado (R$)</label>
            <input
              type="number"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Vencimento (opcional)</label>
            <input
              type="date"
              value={maturity}
              onChange={(e) => setMaturity(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting || !assetId || !description || !value}
              className="flex-1 py-2 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Registrando..." : "Confirmar Aporte"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-main)] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
