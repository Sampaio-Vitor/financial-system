"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  RefreshCw,
  Plus,
  Settings,
  AlertTriangle,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import PluggyCredentialsDialog from "@/components/pluggy-credentials-dialog";
import BankConnectDialog from "@/components/bank-connect-dialog";
import type { BankConnection } from "@/types";

function timeSince(dateStr: string | null) {
  if (!dateStr) return "nunca";
  const normalizedDate = /(?:Z|[+-]\d{2}:?\d{2})$/.test(dateStr)
    ? dateStr
    : `${dateStr}Z`;
  const timestamp = new Date(normalizedDate).getTime();
  if (!Number.isFinite(timestamp)) return "nunca";
  const diff = Math.max(0, Date.now() - timestamp);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

export default function ConexoesPage() {
  const [hasCredentials, setHasCredentials] = useState<boolean | null>(null);
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [editingConnId, setEditingConnId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);

  const fetchCredentialsStatus = useCallback(async () => {
    try {
      const data = await apiFetch<{ has_credentials: boolean }>("/pluggy-credentials");
      setHasCredentials(data.has_credentials);
    } catch {
      setHasCredentials(false);
    }
  }, []);

  const fetchConnections = useCallback(async () => {
    try {
      const data = await apiFetch<BankConnection[]>("/connections");
      setConnections(data);
    } catch {
      setConnections([]);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchCredentialsStatus(), fetchConnections()]).finally(() =>
      setLoading(false)
    );
  }, [fetchCredentialsStatus, fetchConnections]);

  const handleSync = async (connectionId: number) => {
    setSyncing(connectionId);
    try {
      const result = await apiFetch<{ new_transactions: number; connection_status: string }>(
        `/connections/${connectionId}/sync`,
        { method: "POST" }
      );
      toast.success(`Sincronizado: ${result.new_transactions} novas transações`);
      await fetchConnections();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao sincronizar");
    } finally {
      setSyncing(null);
    }
  };

  const handleDeleteConnection = async (connectionId: number) => {
    if (!confirm("Deseja desconectar este banco? Todas as transações serão removidas.")) return;
    try {
      await apiFetch(`/connections/${connectionId}`, { method: "DELETE" });
      toast.success("Banco desconectado");
      await fetchConnections();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao desconectar");
    }
  };

  const handleRename = async (connectionId: number) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingConnId(null);
      return;
    }
    try {
      await apiFetch(`/connections/${connectionId}`, {
        method: "PATCH",
        body: JSON.stringify({ institution_name: trimmed }),
      });
      await fetchConnections();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao renomear");
    }
    setEditingConnId(null);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-[var(--color-bg-card)] rounded-lg animate-pulse" />
        <div className="h-48 bg-[var(--color-bg-card)] rounded-2xl animate-pulse" />
      </div>
    );
  }

  // State 1: No credentials
  if (!hasCredentials) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Conexões Bancárias</h1>
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-[var(--color-accent)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Settings size={28} className="text-[var(--color-accent)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            Configure o Pluggy
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            Insira suas credenciais do Pluggy para conectar seus bancos e importar transações automaticamente.
          </p>
          <button
            onClick={() => setShowCredentialsDialog(true)}
            className="px-6 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90"
          >
            Configurar Pluggy
          </button>
        </div>
        <PluggyCredentialsDialog
          isOpen={showCredentialsDialog}
          onClose={() => setShowCredentialsDialog(false)}
          onSaved={fetchCredentialsStatus}
        />
      </div>
    );
  }

  // State 2: Credentials but no connections
  if (connections.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Conexões Bancárias</h1>
          <button
            onClick={() => setShowCredentialsDialog(true)}
            className="p-2 rounded-xl hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)]"
            title="Configurar Pluggy"
          >
            <Settings size={18} />
          </button>
        </div>
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-[var(--color-accent)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus size={28} className="text-[var(--color-accent)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            Conecte um banco
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            Conecte suas contas bancárias para detectar proventos e importar dados automaticamente.
          </p>
          <button
            onClick={() => setShowConnectDialog(true)}
            className="px-6 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90"
          >
            Conectar Banco
          </button>
        </div>
        <PluggyCredentialsDialog
          isOpen={showCredentialsDialog}
          onClose={() => setShowCredentialsDialog(false)}
          onSaved={fetchCredentialsStatus}
        />
        <BankConnectDialog
          isOpen={showConnectDialog}
          onClose={() => setShowConnectDialog(false)}
          onConnected={fetchConnections}
        />
      </div>
    );
  }

  // State 3: Connected — connection management
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Conexões Bancárias</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCredentialsDialog(true)}
            className="p-2 rounded-xl hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)]"
            title="Configurar Pluggy"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={() => setShowConnectDialog(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90"
          >
            <Plus size={16} />
            Adicionar Banco
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {connections.map((conn) => (
          <div
            key={conn.id}
            className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    conn.status === "active"
                      ? "bg-green-400"
                      : conn.status === "expired"
                      ? "bg-yellow-400"
                      : "bg-red-400"
                  }`}
                />
                {editingConnId === conn.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleRename(conn.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(conn.id);
                      if (e.key === "Escape") setEditingConnId(null);
                    }}
                    className="text-sm font-semibold text-[var(--color-text-primary)] bg-[var(--color-bg-main)] border border-[var(--color-accent)] rounded px-2 py-1 w-48 focus:outline-none"
                  />
                ) : (
                  <span
                    className="text-sm font-semibold text-[var(--color-text-primary)] cursor-pointer hover:underline"
                    onDoubleClick={() => {
                      setEditingConnId(conn.id);
                      setEditingName(conn.institution_name);
                    }}
                    title="Duplo clique para editar"
                  >
                    {conn.institution_name}
                  </span>
                )}
                <span className="text-xs text-[var(--color-text-muted)]">
                  Última sync: {timeSince(conn.last_sync_at)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {conn.status === "active" ? (
                  <button
                    onClick={() => handleSync(conn.id)}
                    disabled={syncing === conn.id}
                    className="p-2 rounded-lg hover:bg-[var(--color-bg-main)] text-[var(--color-text-muted)] disabled:opacity-50 transition-colors"
                    title="Sincronizar"
                  >
                    {syncing === conn.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowConnectDialog(true)}
                    className="p-2 rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                    title="Reconectar"
                  >
                    <AlertTriangle size={16} />
                  </button>
                )}
                <button
                  onClick={() => handleDeleteConnection(conn.id)}
                  className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remover conexão"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {conn.accounts.length > 0 && (
              <div className="ml-5 space-y-2 border-l border-[var(--color-border)] pl-4">
                {conn.accounts.map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">
                      {acc.name}
                      <span className="text-[var(--color-text-muted)] ml-1.5">
                        ({acc.type === "credit_card" ? "Cartão" : acc.type === "checking" ? "Corrente" : "Poupança"})
                      </span>
                    </span>
                    <span className="text-[var(--color-text-secondary)] font-medium tabular-nums">
                      {formatBRL(acc.balance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <PluggyCredentialsDialog
        isOpen={showCredentialsDialog}
        onClose={() => setShowCredentialsDialog(false)}
        onSaved={fetchCredentialsStatus}
      />
      <BankConnectDialog
        isOpen={showConnectDialog}
        onClose={() => setShowConnectDialog(false)}
        onConnected={fetchConnections}
      />
    </div>
  );
}
