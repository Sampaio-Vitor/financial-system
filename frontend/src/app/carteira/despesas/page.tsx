"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  TrendingDown,
  TrendingUp,
  Scale,
  CalendarDays,
  Search,
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

const CATEGORY_COLORS: Record<string, { badge: string; bar: string }> = {
  "Alimentação": { badge: "bg-orange-500/20 text-orange-400", bar: "#f97316" },
  "Mercado": { badge: "bg-green-500/20 text-green-400", bar: "#22c55e" },
  "Transporte": { badge: "bg-blue-500/20 text-blue-400", bar: "#3b82f6" },
  "Moradia": { badge: "bg-purple-500/20 text-purple-400", bar: "#a855f7" },
  "Saúde": { badge: "bg-red-500/20 text-red-400", bar: "#ef4444" },
  "Lazer": { badge: "bg-pink-500/20 text-pink-400", bar: "#ec4899" },
  "Assinaturas": { badge: "bg-indigo-500/20 text-indigo-400", bar: "#6366f1" },
  "Educação": { badge: "bg-cyan-500/20 text-cyan-400", bar: "#06b6d4" },
  "Vestuário": { badge: "bg-yellow-500/20 text-yellow-400", bar: "#eab308" },
  "Transferências": { badge: "bg-gray-500/20 text-gray-400", bar: "#6b7280" },
  "Transferência interna": { badge: "bg-gray-500/20 text-gray-500", bar: "#4b5563" },
  "Investimentos": { badge: "bg-emerald-500/20 text-emerald-400", bar: "#10b981" },
  "Pets": { badge: "bg-amber-500/20 text-amber-400", bar: "#f59e0b" },
  "Renda": { badge: "bg-teal-500/20 text-teal-400", bar: "#14b8a6" },
  "Outros": { badge: "bg-slate-500/20 text-slate-400", bar: "#64748b" },
};

function getCategoryStyle(category: string) {
  return (CATEGORY_COLORS[category] || CATEGORY_COLORS["Outros"]).badge;
}

function getCategoryBarColor(category: string) {
  return (CATEGORY_COLORS[category] || CATEGORY_COLORS["Outros"]).bar;
}

// Group transactions by date for day-header display
function groupByDate(txns: ExpenseTransaction[]): { date: string; label: string; transactions: ExpenseTransaction[] }[] {
  const groups: Record<string, ExpenseTransaction[]> = {};
  for (const txn of txns) {
    if (!groups[txn.date]) groups[txn.date] = [];
    groups[txn.date].push(txn);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, transactions]) => {
      const d = new Date(date + "T00:00:00");
      const weekday = d.toLocaleDateString("pt-BR", { weekday: "long" });
      const day = d.getDate();
      const monthName = d.toLocaleDateString("pt-BR", { month: "long" });
      const label = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${day} de ${monthName}`;
      return { date, label, transactions };
    });
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
  const [searchQuery, setSearchQuery] = useState("");

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

  // Close manage panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (managePanelRef.current && !managePanelRef.current.contains(e.target as Node)) {
        setShowManagePanel(false);
      }
    }
    if (showManagePanel) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showManagePanel]);

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
        <div className="h-8 w-64 bg-[var(--color-bg-card)] rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-[var(--color-bg-card)] rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-48 bg-[var(--color-bg-card)] rounded-2xl animate-pulse" />
        <div className="h-96 bg-[var(--color-bg-card)] rounded-2xl animate-pulse" />
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
          onConnected={() => {
            fetchConnections();
            fetchTransactions();
          }}
        />
      </div>
    );
  }

  // State 3: Connected — full view
  return <ConnectedView
    month={month}
    setMonth={setMonth}
    year={year}
    monthNum={monthNum}
    summary={summary}
    transactions={transactions}
    connections={connections}
    categoryFilter={categoryFilter}
    setCategoryFilter={setCategoryFilter}
    activeConnectionIds={activeConnectionIds}
    searchQuery={searchQuery}
    setSearchQuery={setSearchQuery}
    showManagePanel={showManagePanel}
    setShowManagePanel={setShowManagePanel}
    managePanelRef={managePanelRef}
    editingConnId={editingConnId}
    setEditingConnId={setEditingConnId}
    editingName={editingName}
    setEditingName={setEditingName}
    syncing={syncing}
    toggleConnection={(connId: number) => {
      setActiveConnectionIds((prev) => {
        const next = new Set(prev);
        if (next.has(connId)) next.delete(connId);
        else next.add(connId);
        return next;
      });
    }}
    handleSync={handleSync}
    handleDeleteConnection={handleDeleteConnection}
    handleReconnect={handleReconnect}
    handleRename={handleRename}
    formatDate={formatDate}
    timeSince={timeSince}
    showConnectDialog={showConnectDialog}
    setShowConnectDialog={setShowConnectDialog}
    showCredentialsDialog={showCredentialsDialog}
    setShowCredentialsDialog={setShowCredentialsDialog}
    fetchCredentialsStatus={fetchCredentialsStatus}
    fetchConnections={fetchConnections}
    fetchTransactions={fetchTransactions}
  />;
}

// Extracted connected view to keep the main component lean
function ConnectedView({
  month, setMonth, year, monthNum, summary, transactions, connections,
  categoryFilter, setCategoryFilter, activeConnectionIds, searchQuery, setSearchQuery,
  showManagePanel, setShowManagePanel, managePanelRef, editingConnId, setEditingConnId,
  editingName, setEditingName, syncing, toggleConnection, handleSync, handleDeleteConnection,
  handleReconnect, handleRename, formatDate, timeSince, showConnectDialog, setShowConnectDialog,
  showCredentialsDialog, setShowCredentialsDialog, fetchCredentialsStatus, fetchConnections, fetchTransactions,
}: {
  month: string;
  setMonth: (m: string) => void;
  year: number;
  monthNum: number;
  summary: TransactionSummary | null;
  transactions: ExpenseTransaction[];
  connections: BankConnection[];
  categoryFilter: string;
  setCategoryFilter: (f: string) => void;
  activeConnectionIds: Set<number>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  showManagePanel: boolean;
  setShowManagePanel: (v: boolean) => void;
  managePanelRef: React.RefObject<HTMLDivElement | null>;
  editingConnId: number | null;
  setEditingConnId: (id: number | null) => void;
  editingName: string;
  setEditingName: (n: string) => void;
  syncing: number | null;
  toggleConnection: (id: number) => void;
  handleSync: (id: number) => Promise<void>;
  handleDeleteConnection: (id: number) => Promise<void>;
  handleReconnect: () => void;
  handleRename: (id: number) => Promise<void>;
  formatDate: (d: string) => string;
  timeSince: (d: string | null) => string;
  showConnectDialog: boolean;
  setShowConnectDialog: (v: boolean) => void;
  showCredentialsDialog: boolean;
  setShowCredentialsDialog: (v: boolean) => void;
  fetchCredentialsStatus: () => Promise<void>;
  fetchConnections: () => Promise<void>;
  fetchTransactions: () => Promise<void>;
}) {
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

  // Unique bank names for filter
  const bankNames = [...new Set(connections.map((c) => c.institution_name))];

  const [bankFilter, setBankFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const getBankName = (accountId: number) => accountBankMap[accountId] || "—";

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((txn) => {
      const connId = accountConnectionMap[txn.account_id];
      if (connId !== undefined && !activeConnectionIds.has(connId)) return false;
      if (bankFilter && getBankName(txn.account_id) !== bankFilter) return false;
      if (typeFilter === "credit" && txn.type !== "credit") return false;
      if (typeFilter === "debit" && txn.type !== "debit") return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchDesc = txn.description.toLowerCase().includes(q);
        const matchPayee = txn.payee?.toLowerCase().includes(q);
        if (!matchDesc && !matchPayee) return false;
      }
      return true;
    });
  }, [transactions, activeConnectionIds, accountConnectionMap, bankFilter, typeFilter, searchQuery]);

  const groupedTransactions = useMemo(() => groupByDate(filteredTransactions), [filteredTransactions]);
  // Summary computations
  const totalExpenses = summary?.total_expenses ?? 0;
  const totalIncome = summary?.total_income ?? 0;
  const netBalance = totalIncome - totalExpenses;
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const today = new Date();
  const daysElapsed = (today.getFullYear() === year && today.getMonth() + 1 === monthNum)
    ? today.getDate()
    : daysInMonth;
  const dailyAvg = daysElapsed > 0 ? totalExpenses / daysElapsed : 0;
  const totalTxCount = summary ? summary.categories.reduce((sum, c) => sum + c.count, 0) : 0;

  // Category bars data
  const maxCatTotal = summary ? Math.max(...summary.categories.map((c) => c.total), 1) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Despesas</h1>
          <span className="text-2xl text-[var(--color-text-muted)] font-light hidden sm:inline">&mdash;</span>
          {/* Month navigation inline */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMonth(getPrevMonth(month))}
              className="p-1.5 rounded-lg hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)] transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-lg font-semibold text-[var(--color-text-primary)] min-w-[170px] text-center select-none">
              {getMonthLabel(month)}
            </span>
            <button
              onClick={() => setMonth(getNextMonth(month))}
              className="p-1.5 rounded-lg hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)] transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Settings dropdown */}
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

          {showManagePanel && (
            <div className="absolute right-0 top-full mt-2 w-[480px] bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] shadow-2xl shadow-black/40 z-40">
              <div className="px-4 py-3 border-b border-[var(--color-border)]">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Conexões bancárias</p>
              </div>
              <div className="p-2 space-y-1 max-h-80 overflow-y-auto">
                {connections.map((conn) => (
                  <div key={conn.id} className="rounded-lg p-3 hover:bg-[var(--color-bg-main)] transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2.5">
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
                            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)] disabled:opacity-50 transition-colors"
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
                            className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                            title="Reconectar"
                          >
                            <AlertTriangle size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteConnection(conn.id)}
                          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Remover conexão"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] ml-[42px]">
                      Última sync: {timeSince(conn.last_sync_at)}
                    </div>
                    {conn.accounts.length > 0 && (
                      <div className="mt-2 ml-[42px] space-y-1">
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
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors"
                >
                  <Plus size={14} />
                  Adicionar banco
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<TrendingDown size={18} />}
          iconColor="text-red-400"
          iconBg="bg-red-500/10"
          label="Saídas do mês"
          value={formatBRL(totalExpenses)}
          valueColor="text-red-400"
          subtitle={`${totalTxCount} transações`}
        />
        <SummaryCard
          icon={<TrendingUp size={18} />}
          iconColor="text-green-400"
          iconBg="bg-green-500/10"
          label="Entradas do mês"
          value={formatBRL(totalIncome)}
          valueColor="text-green-400"
          subtitle={`${totalTxCount} transações`}
        />
        <SummaryCard
          icon={<Scale size={18} />}
          iconColor="text-yellow-400"
          iconBg="bg-yellow-500/10"
          label="Saldo líquido"
          value={`${netBalance < 0 ? "- " : ""}${formatBRL(Math.abs(netBalance))}`}
          valueColor={netBalance >= 0 ? "text-green-400" : "text-red-400"}
        />
        <SummaryCard
          icon={<CalendarDays size={18} />}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10"
          label="Média diária"
          value={formatBRL(dailyAvg)}
          valueColor="text-[var(--color-text-primary)]"
          subtitle={`${daysElapsed} dias`}
        />
      </div>

      {/* Despesas por Categoria */}
      {summary && summary.categories.length > 0 && (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Despesas por Categoria</h2>
          <div className="space-y-3">
            {summary.categories.map((cat) => {
              const pct = totalExpenses > 0 ? (cat.total / totalExpenses) * 100 : 0;
              const barWidth = (cat.total / maxCatTotal) * 100;
              const isActive = categoryFilter === cat.category;

              return (
                <button
                  key={cat.category}
                  onClick={() => setCategoryFilter(isActive ? "" : cat.category)}
                  className={`w-full group transition-opacity ${
                    categoryFilter && !isActive ? "opacity-40" : "opacity-100"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-[var(--color-text-muted)] w-11 text-right tabular-nums shrink-0">
                      {pct.toFixed(1)}%
                    </span>
                    <div className="flex-1 h-6 bg-[var(--color-bg-main)] rounded overflow-hidden relative">
                      <div
                        className="h-full rounded transition-all"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: getCategoryBarColor(cat.category),
                        }}
                      />
                      <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-medium text-white/90 drop-shadow-sm">
                        {cat.category}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--color-text-secondary)] w-24 text-right tabular-nums shrink-0">
                      {formatBRL(cat.total)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
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

        {bankNames.length > 1 && (
          <select
            value={bankFilter}
            onChange={(e) => setBankFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="">Todos bancos</option>
            {bankNames.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        )}

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">Entradas e Saídas</option>
          <option value="debit">Somente Saídas</option>
          <option value="credit">Somente Entradas</option>
        </select>

        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>
      </div>

      {/* Transaction list — grouped by day */}
      {filteredTransactions.length === 0 ? (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-12 text-center">
          <p className="text-[var(--color-text-secondary)]">Nenhuma transação encontrada para este mês.</p>
        </div>
      ) : (
        <>
          {/* Desktop: grouped table */}
          <div className="hidden md:block space-y-1">
            {groupedTransactions.map((group) => (
              <div key={group.date}>
                {/* Day header */}
                <div className="px-2 py-2">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {group.label}
                  </span>
                </div>

                {/* Transactions for this day */}
                <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] overflow-hidden">
                  <table className="w-full">
                    <tbody className="divide-y divide-[var(--color-border)]/50">
                      {group.transactions.map((txn) => (
                        <tr key={txn.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-sm text-[var(--color-text-muted)] whitespace-nowrap w-16 tabular-nums">
                            {formatDate(txn.date)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="min-w-0">
                              <span className="text-sm text-[var(--color-text-primary)] block truncate">{txn.description}</span>
                              {txn.payee && (
                                <span className="text-xs text-[var(--color-text-muted)] block truncate">{txn.payee}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-[var(--color-text-muted)] whitespace-nowrap w-28">
                            {getBankName(txn.account_id)}
                          </td>
                          <td className="px-4 py-3 w-32">
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium ${getCategoryStyle(txn.category)}`}>
                              {txn.category}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-sm font-semibold text-right whitespace-nowrap tabular-nums w-32 ${
                            txn.type === "credit" ? "text-green-400" : "text-[var(--color-text-primary)]"
                          }`}>
                            {txn.type === "credit" ? "+" : "-"}{formatBRL(txn.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
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

function SummaryCard({
  icon, iconColor, iconBg, label, value, valueColor, subtitle,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  valueColor: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center ${iconColor}`}>
          {icon}
        </div>
        <p className="text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
      </div>
      <p className={`text-xl font-bold ${valueColor} tabular-nums`}>{value}</p>
      {subtitle && (
        <p className="text-xs text-[var(--color-text-muted)] mt-1">{subtitle}</p>
      )}
    </div>
  );
}
