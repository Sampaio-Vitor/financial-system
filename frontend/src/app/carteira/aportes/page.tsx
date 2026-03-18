"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Purchase, Asset } from "@/types";
import { formatBRL, formatQuantity } from "@/lib/format";
import PurchaseForm from "@/components/purchase-form";

export default function AportesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchPurchases = useCallback(async () => {
    try {
      const data = await apiFetch<Purchase[]>("/purchases");
      setPurchases(data);
    } catch {
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleDelete = async (id: number) => {
    if (!confirm("Remover este aporte? Isso afetara os calculos da carteira.")) return;
    try {
      await apiFetch(`/purchases/${id}`, { method: "DELETE" });
      fetchPurchases();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao remover");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Historico de Aportes</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Registrar Aporte
        </button>
      </div>

      {showForm && (
        <PurchaseForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            fetchPurchases();
          }}
        />
      )}

      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
        {loading ? (
          <div className="animate-pulse h-64" />
        ) : purchases.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-center py-8">
            Nenhum aporte registrado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Data</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Ticker</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Tipo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Qtd</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Preco Unit.</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Total</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50">
                    <td className="px-3 py-2.5">
                      {new Date(p.purchase_date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2.5 font-medium">{p.ticker}</td>
                    <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{p.asset_type}</td>
                    <td className="px-3 py-2.5">{formatQuantity(p.quantity)}</td>
                    <td className="px-3 py-2.5">{formatBRL(p.unit_price)}</td>
                    <td className="px-3 py-2.5 font-medium">{formatBRL(p.total_value)}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-xs text-[var(--color-negative)] hover:underline"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
