"use client";

import { useState, useCallback } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold mb-2">{title}</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-main)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-[var(--color-negative)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface UseConfirmReturn {
  confirm: (title: string, message: string, confirmLabel?: string) => Promise<boolean>;
  ConfirmDialog: () => React.ReactNode;
}

export function useConfirm(): UseConfirmReturn {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    resolve: ((value: boolean) => void) | null;
  }>({ open: false, title: "", message: "", confirmLabel: "Confirmar", resolve: null });

  const confirm = useCallback(
    (title: string, message: string, confirmLabel = "Confirmar") =>
      new Promise<boolean>((resolve) => {
        setState({ open: true, title, message, confirmLabel, resolve });
      }),
    []
  );

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state.resolve]);

  const ConfirmDialog = useCallback(
    () => (
      <ConfirmModal
        open={state.open}
        title={state.title}
        message={state.message}
        confirmLabel={state.confirmLabel}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ),
    [state.open, state.title, state.message, state.confirmLabel, handleConfirm, handleCancel]
  );

  return { confirm, ConfirmDialog };
}
