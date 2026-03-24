"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface PluggyConnectProps {
  connectToken: string;
  onSuccess?: (data: { item: { id: string } }) => void;
  onError?: (error: { message: string }) => void;
  onClose?: () => void;
  theme?: string;
  language?: string;
}

interface BankConnectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export default function BankConnectDialog({
  isOpen,
  onClose,
  onConnected,
}: BankConnectDialogProps) {
  const [mode, setMode] = useState<"choose" | "widget" | "manual">("choose");
  const [itemId, setItemId] = useState("");
  const [connectionName, setConnectionName] = useState("");
  const [saving, setSaving] = useState(false);
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [Widget, setWidget] = useState<ComponentType<PluggyConnectProps> | null>(null);

  // Lazy-load widget
  useEffect(() => {
    import("react-pluggy-connect").then((mod) => {
      setWidget(() => mod.PluggyConnect as ComponentType<PluggyConnectProps>);
    }).catch(() => {});
  }, []);

  const fetchToken = useCallback(async () => {
    setLoadingToken(true);
    try {
      const data = await apiFetch<{ access_token: string }>(
        "/connections/connect-token",
        { method: "POST" }
      );
      setConnectToken(data.access_token);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar token");
      setMode("choose");
    } finally {
      setLoadingToken(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "widget") {
      fetchToken();
    }
  }, [mode, fetchToken]);

  const handleWidgetSuccess = useCallback(
    async (data: { item: { id: string } }) => {
      const name = prompt("Nome para esta conexão (ex: Nubank, Inter):");
      setSaving(true);
      try {
        await apiFetch("/connections/callback", {
          method: "POST",
          body: JSON.stringify({
            item_id: data.item.id,
            connection_name: name || undefined,
          }),
        });
        toast.success("Banco conectado com sucesso!");
        onConnected();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Erro ao processar conexão");
      } finally {
        setSaving(false);
      }
      onClose();
    },
    [onConnected, onClose]
  );

  const handleManualConnect = async () => {
    const trimmed = itemId.trim();
    if (!trimmed) {
      toast.error("Cole o Item ID do Pluggy");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/connections/callback", {
        method: "POST",
        body: JSON.stringify({
          item_id: trimmed,
          connection_name: connectionName.trim() || undefined,
        }),
      });
      toast.success("Banco conectado com sucesso!");
      setItemId("");
      setConnectionName("");
      onConnected();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao conectar banco");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setMode("choose");
    setConnectToken(null);
    setItemId("");
    setConnectionName("");
    onClose();
  };

  if (!isOpen) return null;

  // Widget mode
  if (mode === "widget") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
        <div className="relative z-10">
          {(loadingToken || !Widget || !connectToken) ? (
            <div className="bg-[var(--color-bg-card)] rounded-2xl p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm text-[var(--color-text-secondary)]">Carregando widget...</p>
            </div>
          ) : (
            <Widget
              connectToken={connectToken}
              onSuccess={handleWidgetSuccess}
              onError={(err) => {
                toast.error(`Erro: ${err.message}`);
                handleClose();
              }}
              onClose={handleClose}
              theme="dark"
              language="pt"
            />
          )}
        </div>
      </div>
    );
  }

  // Manual mode or choose mode
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Conectar Banco
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-main)] text-[var(--color-text-muted)]"
          >
            <X size={18} />
          </button>
        </div>

        {mode === "choose" ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Escolha como importar sua conexão bancária do MeuPluggy:
            </p>
            <button
              onClick={() => setMode("widget")}
              className="w-full p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-accent)] bg-[var(--color-bg-main)] text-left transition-colors"
            >
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                Importar via Widget Pluggy
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Autorize o acesso às suas contas do MeuPluggy diretamente
              </p>
            </button>
            <button
              onClick={() => setMode("manual")}
              className="w-full p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-accent)] bg-[var(--color-bg-main)] text-left transition-colors"
            >
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                Colar Item ID manualmente
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Copie o Item ID do dashboard.pluggy.ai
              </p>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => setMode("choose")}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              &larr; Voltar
            </button>
            <div className="bg-[var(--color-bg-main)] rounded-xl p-4 text-sm text-[var(--color-text-secondary)] space-y-2">
              <p className="font-medium text-[var(--color-text-primary)]">Como obter o Item ID:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  Acesse{" "}
                  <a href="https://dashboard.pluggy.ai" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
                    dashboard.pluggy.ai
                  </a>
                </li>
                <li>Vá em Items e copie o ID da conexão</li>
              </ol>
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Nome da conexão</label>
              <input
                type="text"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder="Ex: Nubank, Inter, Bradesco..."
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Item ID</label>
              <input
                type="text"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]">
                Cancelar
              </button>
              <button
                onClick={handleManualConnect}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Conectando..." : "Conectar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
