"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  Settings,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { formatBRL, getCurrentMonth, getPrevMonth, getNextMonth, getMonthLabel } from "@/lib/format";
import PluggyCredentialsDialog from "@/components/pluggy-credentials-dialog";
import BankConnectDialog from "@/components/bank-connect-dialog";
import MobileCard from "@/components/mobile-card";
import type {
  BankConnection,
  ExpenseTransaction,
  TransactionSummary,
  TransactionListResponse,
} from "@/types";

const CATEGORY_COLORS: Record<string, string> = {
  "Alimentação": "bg-orange-500/20 text-orange-400",
  "Mercado": "bg-green-500/20 text-green-400",
  "Transporte": "bg-blue-500/20 text-blue-400",
  "Moradia": "bg-purple-500/20 text-purple-400",
  "Saúde": "bg-red-500/20 text-red-400",
  "Lazer": "bg-pink-500/20 text-pink-400",
  "Assinaturas": "bg-indigo-500/20 text-indigo-400",
  "Educação": "bg-cyan-500/20 text-cyan-400",
  "Vestuário": "bg-yellow-500/20 text-yellow-400",
  "Transferências": "bg-gray-500/20 text-gray-400",
  "Investimentos": "bg-emerald-500/20 text-emerald-400",
  "Outros": "bg-slate-500/20 text-slate-400",
};

function getCategoryStyle(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS["Outros"];
}

export default function DespesasPage() {
  const [month, setMonth] = useState(getCurrentMonth);
  const [hasCredentials, setHasCredentials] = useState<boolean | null>(null);
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // Dialogs
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);

  const [year, monthNum] = month.split("-").map(Number);

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

  const fetchTransactions = useCallback(async () => {
    try {
      const [txData, summaryData] = await Promise.all([
        apiFetch<TransactionListResponse>(
          `/transactions?year=${year}&month=${monthNum}${categoryFilter ? `&category=${encodeURIComponent(categoryFilter)}` : ""}`
        ),
        apiFetch<TransactionSummary>(`/transactions/summary?year=${year}&month=${monthNum}`),
      ]);
      setTransactions(txData.transactions);
      setSummary(summaryData);
    } catch {
      setTransactions([]);
      setSummary(null);
    }
  }, [year, monthNum, categoryFilter]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await fetchCredentialsStatus();
    await fetchConnections();
    await fetchTransactions();
    setLoading(false);
  }, [fetchCredentialsStatus, fetchConnections, fetchTransactions]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSync = async (connectionId: number) => {
    setSyncing(connectionId);
    try {
      const result = await apiFetch<{ new_transactions: number; connection_status: string }>(
        `/connections/${connectionId}/sync`,
        { method: "POST" }
      );
      toast.success(`Sincronizado: ${result.new_transactions} novas transações`);
      await fetchConnections();
      await fetchTransactions();
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
      await fetchTransactions();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao desconectar");
    }
  };

  const handleReconnect = () => {
    setShowConnectDialog(true);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const timeSince = (dateStr: string | null) => {
    if (!dateStr) return "nunca";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Despesas</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-[var(--color-bg-card)] rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-[var(--color-bg-card)] rounded-2xl animate-pulse" />
      </div>
    );
  }

  // State 1: No credentials
  if (!hasCredentials) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Despesas</h1>
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
          onSaved={() => {
            fetchCredentialsStatus();
          }}
        />
      </div>
    );
  }

  // State 2: Credentials but no connections
  if (connections.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Despesas</h1>
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
            Conecte suas contas bancárias para visualizar suas despesas automaticamente.
          </p>
          <button
            onClick={() => {
              setShowConnectDialog(true);
            }}
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
          onConnected={() => {
            fetchConnections();
            fetchTransactions();
          }}
        />
      </div>
    );
  }

  // State 3: Connected — full view
  const allCategories = summary ? summary.categories.map((c) => c.category) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Despesas</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCredentialsDialog(true)}
            className="p-2 rounded-xl hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)]"
            title="Configurar Pluggy"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={() => {
              setShowConnectDialog(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Banco</span>
          </button>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setMonth(getPrevMonth(month))}
          className="p-2 rounded-xl hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)]"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-lg font-semibold text-[var(--color-text-primary)] min-w-[200px] text-center">
          {getMonthLabel(month)}
        </span>
        <button
          onClick={() => setMonth(getNextMonth(month))}
          className="p-2 rounded-xl hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)]"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Category summary cards */}
      {summary && summary.categories.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {/* Total card */}
          <div className="shrink-0 bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4 min-w-[140px]">
            <p className="text-xs text-[var(--color-text-muted)] mb-1">Total Despesas</p>
            <p className="text-lg font-bold text-red-400">{formatBRL(summary.total_expenses)}</p>
            {summary.total_income > 0 && (
              <p className="text-xs text-green-400 mt-1">+{formatBRL(summary.total_income)} receitas</p>
            )}
          </div>
          {summary.categories.map((cat) => (
            <button
              key={cat.category}
              onClick={() => setCategoryFilter(categoryFilter === cat.category ? "" : cat.category)}
              className={`shrink-0 rounded-xl border p-4 min-w-[130px] text-left transition-all ${
                categoryFilter === cat.category
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-accent)]/50"
              }`}
            >
              <p className="text-xs text-[var(--color-text-muted)] mb-1">{cat.category}</p>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{formatBRL(cat.total)}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{cat.count} transações</p>
            </button>
          ))}
        </div>
      )}

      {/* Connections status bar */}
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-3">
        <div className="flex flex-wrap gap-3">
          {connections.map((conn) => (
            <div key={conn.id} className="flex items-center gap-2 text-sm">
              <span
                className={`w-2 h-2 rounded-full ${
                  conn.status === "active"
                    ? "bg-green-400"
                    : conn.status === "expired"
                    ? "bg-yellow-400"
                    : "bg-red-400"
                }`}
              />
              <span className="text-[var(--color-text-primary)] font-medium">
                {conn.institution_name}
              </span>
              <span className="text-[var(--color-text-muted)] text-xs">
                {timeSince(conn.last_sync_at)}
              </span>
              {conn.status === "active" ? (
                <button
                  onClick={() => handleSync(conn.id)}
                  disabled={syncing === conn.id}
                  className="p-1 rounded-lg hover:bg-[var(--color-bg-main)] text-[var(--color-text-muted)] disabled:opacity-50"
                  title="Sincronizar"
                >
                  {syncing === conn.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                </button>
              ) : (
                <button
                  onClick={() => handleReconnect()}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs hover:bg-yellow-500/20"
                >
                  <AlertTriangle size={12} />
                  Reconectar
                </button>
              )}
              <button
                onClick={() => handleDeleteConnection(conn.id)}
                className="text-xs text-[var(--color-text-muted)] hover:text-red-400"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Category filter dropdown (mobile-friendly) */}
      <div className="flex items-center gap-2">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">Todas categorias</option>
          {allCategories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        {categoryFilter && (
          <button
            onClick={() => setCategoryFilter("")}
            className="text-xs text-[var(--color-accent)] hover:underline"
          >
            Limpar filtro
          </button>
        )}
      </div>

      {/* Transaction list */}
      {transactions.length === 0 ? (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-secondary)]">
            Nenhuma transação encontrada para este mês.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase">Descrição</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase">Categoria</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase">Valor</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => (
                  <tr key={txn.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-main)]/50">
                    <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                      {formatDate(txn.date)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[var(--color-text-primary)]">{txn.description}</span>
                      {txn.status === "pending" && (
                        <span className="ml-2 text-xs text-yellow-400">(pendente)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryStyle(txn.category)}`}>
                        {txn.category}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium text-right ${
                      txn.type === "credit" ? "text-green-400" : "text-[var(--color-text-primary)]"
                    }`}>
                      {txn.type === "credit" ? "+" : "-"}{formatBRL(txn.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {transactions.map((txn) => (
              <MobileCard
                key={txn.id}
                header={
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {txn.description}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">{formatDate(txn.date)}</p>
                  </div>
                }
                badge={
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryStyle(txn.category)}`}>
                    {txn.category}
                  </span>
                }
                bodyItems={[
                  {
                    label: "Valor",
                    value: (
                      <span className={txn.type === "credit" ? "text-green-400" : "text-[var(--color-text-primary)]"}>
                        {txn.type === "credit" ? "+" : "-"}{formatBRL(txn.amount)}
                      </span>
                    ),
                  },
                  {
                    label: "Status",
                    value: txn.status === "pending" ? "Pendente" : "Confirmado",
                  },
                ]}
              />
            ))}
          </div>
        </>
      )}

      {/* Dialogs */}
      <PluggyCredentialsDialog
        isOpen={showCredentialsDialog}
        onClose={() => setShowCredentialsDialog(false)}
        onSaved={fetchCredentialsStatus}
      />
      <BankConnectDialog
        isOpen={showConnectDialog}
        onClose={() => setShowConnectDialog(false)}
        onConnected={() => {
          fetchConnections();
          fetchTransactions();
        }}
      />
    </div>
  );
}
