"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
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
  "Pets": "bg-amber-500/20 text-amber-400",
  "Renda": "bg-teal-500/20 text-teal-400",
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
  const [activeConnectionIds, setActiveConnectionIds] = useState<Set<number>>(new Set());
  const [editingConnId, setEditingConnId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  // Dialogs & panels
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [showManagePanel, setShowManagePanel] = useState(false);
  const managePanelRef = useRef<HTMLDivElement>(null);

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
      setActiveConnectionIds((prev) => {
        // If empty (first load), enable all. Otherwise keep existing selection.
        if (prev.size === 0) return new Set(data.map((c) => c.id));
        return prev;
      });
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

  // Build accountId → connection map
  const accountBankMap: Record<number, string> = {};
  const accountConnectionMap: Record<number, number> = {};
  for (const conn of connections) {
    for (const acc of conn.accounts) {
      accountBankMap[acc.id] = conn.institution_name;
      accountConnectionMap[acc.id] = conn.id;
    }
  }

  const getBankName = (accountId: number) => accountBankMap[accountId] || "—";

  const toggleConnection = (connId: number) => {
    setActiveConnectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(connId)) {
        next.delete(connId);
      } else {
        next.add(connId);
      }
      return next;
    });
  };

  // Filter transactions by active connections
  const filteredTransactions = transactions.filter((txn) => {
    const connId = accountConnectionMap[txn.account_id];
    return connId === undefined || activeConnectionIds.has(connId);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Despesas</h1>
        <div className="flex items-center gap-2">
          <div className="relative" ref={managePanelRef}>
            <button
              onClick={() => setShowManagePanel(!showManagePanel)}
              className={`flex items-center gap-1 p-2 rounded-xl hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)] transition-colors ${
                showManagePanel ? "bg-[var(--color-bg-card)]" : ""
              }`}
              title="Gerenciar conexões"
            >
              <Settings size={18} />
              <ChevronDown size={14} className={`transition-transform ${showManagePanel ? "rotate-180" : ""}`} />
            </button>

            {/* Manage connections dropdown */}
            {showManagePanel && (
              <div className="absolute right-0 top-full mt-2 w-[540px] bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] shadow-xl z-40">
                <div className="p-3 border-b border-[var(--color-border)]">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Conexões bancárias</p>
                </div>
                <div className="p-2 space-y-1">
                  {connections.map((conn) => (
                    <div key={conn.id} className="rounded-lg p-3 hover:bg-[var(--color-bg-main)]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleConnection(conn.id)}
                            className={`relative w-8 h-4.5 rounded-full transition-colors shrink-0 ${
                              activeConnectionIds.has(conn.id)
                                ? "bg-[var(--color-accent)]"
                                : "bg-[var(--color-border)]"
                            }`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform ${
                              activeConnectionIds.has(conn.id) ? "translate-x-3.5" : ""
                            }`} />
                          </button>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            conn.status === "active" ? "bg-green-400"
                            : conn.status === "expired" ? "bg-yellow-400"
                            : "bg-red-400"
                          }`} />
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
                              className="text-sm font-medium text-[var(--color-text-primary)] bg-[var(--color-bg-main)] border border-[var(--color-accent)] rounded px-1.5 py-0.5 w-32 focus:outline-none"
                            />
                          ) : (
                            <span
                              className="text-sm font-medium text-[var(--color-text-primary)] cursor-pointer hover:underline"
                              onDoubleClick={() => {
                                setEditingConnId(conn.id);
                                setEditingName(conn.institution_name);
                              }}
                              title="Duplo clique para editar"
                            >
                              {conn.institution_name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {conn.status === "active" ? (
                            <button
                              onClick={() => handleSync(conn.id)}
                              disabled={syncing === conn.id}
                              className="p-1.5 rounded-lg hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)] disabled:opacity-50"
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
                              className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10"
                              title="Reconectar"
                            >
                              <AlertTriangle size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteConnection(conn.id)}
                            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10"
                            title="Remover conexão"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)] ml-4">
                        Última sync: {timeSince(conn.last_sync_at)}
                      </div>
                      {conn.accounts.length > 0 && (
                        <div className="mt-2 ml-4 space-y-1">
                          {conn.accounts.map((acc) => (
                            <div key={acc.id} className="flex items-center justify-between text-xs">
                              <span className="text-[var(--color-text-secondary)]">
                                {acc.name}
                                <span className="text-[var(--color-text-muted)] ml-1">
                                  ({acc.type === "credit_card" ? "Cartão" : acc.type === "checking" ? "Corrente" : "Poupança"})
                                </span>
                              </span>
                              <span className="text-[var(--color-text-secondary)] font-medium">
                                {formatBRL(acc.balance)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t border-[var(--color-border)]">
                  <button
                    onClick={() => {
                      setShowManagePanel(false);
                      setShowConnectDialog(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                  >
                    <Plus size={14} />
                    Adicionar banco
                  </button>
                </div>
              </div>
            )}
          </div>
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

      {/* Category filter */}
      <div className="flex items-center gap-2">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">Todas categorias</option>
          {allCategories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        {categoryFilter && (
          <button onClick={() => setCategoryFilter("")} className="text-xs text-[var(--color-accent)] hover:underline">
            Limpar filtro
          </button>
        )}
      </div>

      {/* Transaction list */}
      {filteredTransactions.length === 0 ? (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 text-center">
          <p className="text-[var(--color-text-secondary)]">Nenhuma transação encontrada para este mês.</p>
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
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase">Banco</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase">Categoria</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((txn) => (
                  <tr key={txn.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-main)]/50">
                    <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
                      {formatDate(txn.date)}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-sm text-[var(--color-text-primary)]">{txn.description}</span>
                        {txn.status === "pending" && (
                          <span className="ml-2 text-xs text-yellow-400">(pendente)</span>
                        )}
                      </div>
                      {txn.payee && (
                        <span className="text-xs text-[var(--color-text-muted)]">{txn.payee}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                      {getBankName(txn.account_id)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryStyle(txn.category)}`}>
                        {txn.category}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap ${
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
            {filteredTransactions.map((txn) => (
              <MobileCard
                key={txn.id}
                header={
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                      {txn.description}
                    </p>
                    {txn.payee && (
                      <p className="text-xs text-[var(--color-text-secondary)] truncate">{txn.payee}</p>
                    )}
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {formatDate(txn.date)} · {getBankName(txn.account_id)}
                    </p>
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
