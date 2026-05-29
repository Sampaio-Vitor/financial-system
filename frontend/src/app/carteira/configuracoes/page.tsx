"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, RefreshCcw } from "lucide-react";
import {
  getPushStatus,
  subscribePushNotifications,
  unsubscribePushNotifications,
  type PushStatus,
} from "@/lib/push";

export default function ConfiguracoesPage() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setStatus(await getPushStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar configurações.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const enable = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await subscribePushNotifications();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ativar notificações.");
    } finally {
      setIsSaving(false);
    }
  };

  const disable = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await unsubscribePushNotifications();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao desativar notificações.");
    } finally {
      setIsSaving(false);
    }
  };

  const disabled =
    isLoading ||
    isSaving ||
    !status?.supported ||
    !status?.configured ||
    status.permission === "denied";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          Configurações
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Preferências do app e notificações.
        </p>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-sidebar)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
              <Bell size={20} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Notificações no celular
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
                Receba no iPhone as mesmas notificações que aparecem no sino do app.
              </p>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                {isLoading
                  ? "Verificando..."
                  : status?.subscribed
                    ? "Ativo neste dispositivo."
                    : status?.permission === "denied"
                      ? "Permissão bloqueada nas configurações do navegador."
                      : status?.reason || "Inativo neste dispositivo."}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading || isSaving}
              className="rounded-lg p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
              aria-label="Atualizar estado"
              title="Atualizar estado"
            >
              <RefreshCcw size={18} />
            </button>
            {status?.subscribed ? (
              <button
                type="button"
                onClick={() => void disable()}
                disabled={isLoading || isSaving}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)] disabled:opacity-50"
              >
                <BellOff size={17} />
                Desativar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void enable()}
                disabled={disabled}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Bell size={17} />
                Ativar
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-[var(--color-negative)]/30 bg-[var(--color-negative)]/10 px-3 py-2 text-sm text-[var(--color-negative)]">
            {error}
          </div>
        )}
      </section>
    </div>
  );
}
