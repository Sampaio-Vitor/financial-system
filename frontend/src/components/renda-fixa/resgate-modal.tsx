"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { FixedIncomePosition } from "@/types";
import { formatBRL } from "@/lib/format";
import { ConfirmModal } from "@/components/ui/confirm-modal";

interface ResgateModalProps {
  open: boolean;
  positions: FixedIncomePosition[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ResgateModal({ open, positions, onClose, onSaved }: ResgateModalProps) {
  const [positionId, setPositionId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: "", message: "" });
  const pendingConfirm = useRef<((value: boolean) => void) | null>(null);

  if (!open) return null;

  const selectedPosition = positions.find((p) => p.id === positionId);

  const handleSubmit = async () => {
    if (!positionId || !amount) return;
    const parsed = parseFloat(amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) return;

    if (selectedPosition && parsed >= Number(selectedPosition.current_balance)) {
      const ok = await new Promise<boolean>((resolve) => {
        pendingConfirm.current = resolve;
        setConfirmState({
          open: true,
          title: "Confirmar Resgate Total",
          message: "Valor igual ou superior ao saldo atual. Isso ira remover a posicao. Continuar?",
        });
      });
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      await apiFetch(`/fixed-income/${positionId}/resgate`, {
        method: "POST",
        body: JSON.stringify({ amount: parsed, redemption_date: date }),
      });
      onClose();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao resgatar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={() => {
          pendingConfirm.current?.(true);
          setConfirmState((s) => ({ ...s, open: false }));
        }}
        onCancel={() => {
          pendingConfirm.current?.(false);
          setConfirmState((s) => ({ ...s, open: false }));
        }}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-sm">
          <h2 className="text-lg font-bold mb-4">Resgatar</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Ativo</label>
              <select
                value={positionId ?? ""}
                onChange={(e) => setPositionId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
              >
                <option value="">Selecione um ativo</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.ticker} — {p.description}</option>
                ))}
              </select>
            </div>
            {selectedPosition && (
              <p className="text-sm text-[var(--color-text-muted)]">
                Saldo atual: {formatBRL(selectedPosition.current_balance)}
              </p>
            )}
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Data do Resgate</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Valor do Resgate (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={submitting || !positionId || !amount}
                className="flex-1 py-2 rounded-lg bg-[var(--color-negative)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {submitting ? "Resgatando..." : "Confirmar Resgate"}
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
    </>
  );
}
