"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

interface PluggyCredentialsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function PluggyCredentialsDialog({
  isOpen,
  onClose,
  onSaved,
}: PluggyCredentialsDialogProps) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [ownerNames, setOwnerNames] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [savingNames, setSavingNames] = useState(false);

  const loadOwnerNames = useCallback(async () => {
    try {
      const data = await apiFetch<{ has_credentials: boolean; owner_names: string[] }>("/pluggy-credentials");
      if (data.has_credentials) {
        setOwnerNames(data.owner_names || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadOwnerNames();
  }, [isOpen, loadOwnerNames]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Preencha ambos os campos");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/pluggy-credentials", {
        method: "POST",
        body: JSON.stringify({
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
        }),
      });
      toast.success("Credenciais salvas com sucesso");
      setClientId("");
      setClientSecret("");
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar credenciais");
    } finally {
      setSaving(false);
    }
  };

  const handleAddName = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (ownerNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Nome já adicionado");
      return;
    }
    const updated = [...ownerNames, trimmed];
    setOwnerNames(updated);
    setNewName("");
    saveOwnerNames(updated);
  };

  const handleRemoveName = (index: number) => {
    const updated = ownerNames.filter((_, i) => i !== index);
    setOwnerNames(updated);
    saveOwnerNames(updated);
  };

  const saveOwnerNames = async (names: string[]) => {
    setSavingNames(true);
    try {
      await apiFetch("/pluggy-credentials/owner-names", {
        method: "PUT",
        body: JSON.stringify({ owner_names: names }),
      });
      toast.success("Nomes atualizados");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar nomes");
    } finally {
      setSavingNames(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 w-full max-w-md mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Configurações Pluggy
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-bg-main)] text-[var(--color-text-muted)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Credentials section */}
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Insira suas credenciais do{" "}
          <a
            href="https://dashboard.pluggy.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline"
          >
            Pluggy Dashboard
          </a>
          . Elas serão armazenadas de forma criptografada.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Client Secret
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar Credenciais"}
          </button>
        </div>

        {/* Owner names section */}
        <div className="mt-6 pt-6 border-t border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
            Nomes do titular
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            Transferências para esses nomes são excluídas dos totais (transferências internas entre suas contas).
          </p>

          {ownerNames.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {ownerNames.map((name, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--color-bg-main)] text-sm text-[var(--color-text-primary)]"
                >
                  <span className="truncate">{name}</span>
                  <button
                    onClick={() => handleRemoveName(i)}
                    disabled={savingNames}
                    className="p-1 rounded hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-400 shrink-0 ml-2 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddName();
              }}
              placeholder="Ex: João da Silva"
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <button
              onClick={handleAddName}
              disabled={savingNames || !newName.trim()}
              className="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm hover:opacity-90 disabled:opacity-50"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
