"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Asset, FixedIncomePosition } from "@/types";
import { formatBRL, formatPercent } from "@/lib/format";

interface EditModalProps {
  position: FixedIncomePosition;
  asset: Asset | undefined;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditModal({ position, asset, onClose, onSaved }: EditModalProps) {
  const isTesouro = !!asset?.td_kind;
  const [appliedValue, setAppliedValue] = useState(String(Number(position.applied_value)));
  const [puCompra, setPuCompra] = useState(
    position.purchase_unit_price ? String(Number(position.purchase_unit_price)) : ""
  );
  const [currentBalance, setCurrentBalance] = useState(String(Number(position.current_balance)));
  const [description, setDescription] = useState(position.description);
  const [maturity, setMaturity] = useState(position.maturity_date ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const applied = parseFloat(appliedValue) || 0;
  const pu = parseFloat(puCompra) || 0;
  const quantity = isTesouro && pu > 0 ? applied / pu : null;
  const projectedBalance =
    isTesouro && quantity && asset?.current_price
      ? quantity * Number(asset.current_price)
      : parseFloat(currentBalance) || 0;
  const projectedYield = projectedBalance - applied;
  const projectedYieldPct = applied > 0 ? (projectedYield / applied) * 100 : 0;

  const handleSubmit = async () => {
    if (!appliedValue) return;
    if (isTesouro && (!pu || pu <= 0)) {
      toast.error("Informe o PU na data da compra");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch(`/fixed-income/${position.id}`, {
        method: "PUT",
        body: JSON.stringify({
          description,
          applied_value: applied,
          current_balance: isTesouro ? null : parseFloat(currentBalance),
          purchase_unit_price: isTesouro ? pu : null,
          maturity_date: maturity || null,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">Editar Posição — {position.ticker}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Descrição</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Valor Aplicado (R$)</label>
            <input
              type="number"
              step="any"
              value={appliedValue}
              onChange={(e) => setAppliedValue(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm"
            />
          </div>

          {isTesouro ? (
            <>
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">PU na data da compra (R$)</label>
                <input
                  type="number"
                  step="any"
                  value={puCompra}
                  onChange={(e) => setPuCompra(e.target.value)}
                  placeholder="Ex: 18000.00"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm"
                />
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Confira no extrato do broker.</p>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3 space-y-1 text-sm">
                <div className="flex justify-between text-[var(--color-text-muted)]">
                  <span>Quantidade</span>
                  <span className="text-[var(--color-text-secondary)]">{quantity ? quantity.toFixed(4) : "—"}</span>
                </div>
                <div className="flex justify-between text-[var(--color-text-muted)]">
                  <span>PU atual</span>
                  <span className="text-[var(--color-text-secondary)]">{asset?.current_price ? formatBRL(asset.current_price) : "—"}</span>
                </div>
                <div className="flex justify-between text-[var(--color-text-muted)]">
                  <span>Saldo projetado</span>
                  <span className="text-[var(--color-text-primary)] font-medium">{formatBRL(projectedBalance)}</span>
                </div>
                <div className="flex justify-between text-[var(--color-text-muted)]">
                  <span>Rendimento</span>
                  <span className={projectedYield >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}>
                    {formatBRL(projectedYield)} ({formatPercent(projectedYieldPct)})
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Saldo Atual (R$)</label>
              <input
                type="number"
                step="any"
                value={currentBalance}
                onChange={(e) => setCurrentBalance(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Vencimento (opcional)</label>
            <input
              type="date"
              value={maturity}
              onChange={(e) => setMaturity(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Salvando..." : "Salvar"}
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
