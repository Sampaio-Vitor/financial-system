"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Plus, Trash2, Shield } from "lucide-react";
import Link from "next/link";

interface AllowedUsername {
  id: number;
  username: string;
  created_at: string;
}

interface SystemSettings {
  registration_whitelist_enabled: boolean;
}

export default function AdminPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [whitelist, setWhitelist] = useState<AllowedUsername[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addError, setAddError] = useState("");
  const [toggling, setToggling] = useState(false);
  const [adding, setAdding] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [settingsData, whitelistData] = await Promise.all([
        apiFetch<SystemSettings>("/admin/settings"),
        apiFetch<AllowedUsername[]>("/admin/whitelist"),
      ]);
      setSettings(settingsData);
      setWhitelist(whitelistData);
      setError("");
    } catch {
      setError("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = async () => {
    if (!settings) return;
    setToggling(true);
    try {
      const updated = await apiFetch<SystemSettings>("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          registration_whitelist_enabled: !settings.registration_whitelist_enabled,
        }),
      });
      setSettings(updated);
    } catch {
      setError("Erro ao atualizar configuração");
    } finally {
      setToggling(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setAdding(true);
    setAddError("");
    try {
      await apiFetch<AllowedUsername>("/admin/whitelist", {
        method: "POST",
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      setNewUsername("");
      await fetchData();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Erro ao adicionar");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/admin/whitelist/${id}`, { method: "DELETE" });
      setWhitelist((prev) => prev.filter((entry) => entry.id !== id));
    } catch {
      await fetchData();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-main)] p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="h-8 w-48 rounded-xl bg-[var(--color-bg-card)]/80 animate-pulse" />
          <div className="h-32 rounded-2xl bg-[var(--color-bg-card)]/80 border border-[var(--color-border)] animate-pulse" />
          <div className="h-64 rounded-2xl bg-[var(--color-bg-card)]/80 border border-[var(--color-border)] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/carteira"
            className="p-2 rounded-xl hover:bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3">
            <Shield size={24} className="text-[var(--color-accent)]" />
            <h1 className="text-2xl font-extrabold tracking-tight">Administração</h1>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-[var(--color-negative)]/10 border border-[var(--color-negative)]/20">
            <p className="text-[var(--color-negative)] text-sm font-medium text-center">{error}</p>
          </div>
        )}

        {/* Whitelist Toggle */}
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                Whitelist de Cadastro
              </h2>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                {settings?.registration_whitelist_enabled
                  ? "Ativo — apenas usernames aprovados podem se cadastrar"
                  : "Inativo — cadastro aberto para todos"}
              </p>
            </div>
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 disabled:opacity-50 ${
                settings?.registration_whitelist_enabled
                  ? "bg-[var(--color-accent)]"
                  : "bg-[var(--color-border)]"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-sm transform transition duration-200 ease-in-out ${
                  settings?.registration_whitelist_enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Whitelist Management */}
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">
            Usernames Permitidos
          </h2>

          {/* Add form */}
          <form onSubmit={handleAdd} className="flex gap-3 mb-4">
            <input
              type="text"
              value={newUsername}
              onChange={(e) => {
                setNewUsername(e.target.value);
                setAddError("");
              }}
              placeholder="Digite o username..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 focus:border-[var(--color-accent)] transition-all text-sm"
            />
            <button
              type="submit"
              disabled={adding || !newUsername.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-accent)] text-white font-semibold text-sm hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-colors shadow-sm"
            >
              <Plus size={16} />
              {adding ? "Adicionando..." : "Adicionar"}
            </button>
          </form>

          {addError && (
            <div className="p-3 rounded-xl bg-[var(--color-negative)]/10 border border-[var(--color-negative)]/20 mb-4">
              <p className="text-[var(--color-negative)] text-sm font-medium">{addError}</p>
            </div>
          )}

          {/* Whitelist entries */}
          {whitelist.length === 0 ? (
            <p className="text-[var(--color-text-muted)] text-sm text-center py-8">
              Nenhum username na whitelist.
            </p>
          ) : (
            <div className="space-y-2">
              {whitelist.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)]"
                >
                  <div>
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {entry.username}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)] ml-3">
                      {new Date(entry.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="p-1.5 rounded-lg hover:bg-[var(--color-negative)]/10 text-[var(--color-text-muted)] hover:text-[var(--color-negative)] transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
