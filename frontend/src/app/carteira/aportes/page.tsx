"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Purchase } from "@/types";
import { formatBRL, formatQuantity } from "@/lib/format";
import PurchaseForm from "@/components/purchase-form";
import TickerLogo from "@/components/ticker-logo";

export default function AportesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"compra" | "venda">("compra");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{
    purchase_date: string;
    quantity: string;
    unit_price: string;
  }>({ purchase_date: "", quantity: "", unit_price: "" });
  const [saving, setSaving] = useState(false);

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

  const startEdit = (p: Purchase) => {
    setEditingId(p.id);
    setEditData({
      purchase_date: p.purchase_date,
      quantity: String(p.quantity),
      unit_price: String(p.unit_price),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      await apiFetch(`/purchases/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          purchase_date: editData.purchase_date,
          quantity: parseFloat(editData.quantity),
          unit_price: parseFloat(editData.unit_price),
        }),
      });
      setEditingId(null);
      fetchPurchases();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Historico de Aportes</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setFormMode("compra"); setShowForm(true); }}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Registrar Aporte
          </button>
          <button
            onClick={() => { setFormMode("venda"); setShowForm(true); }}
            className="px-4 py-2 rounded-lg bg-[var(--color-negative)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Registrar Venda
          </button>
        </div>
      </div>

      {showForm && (
        <PurchaseForm
          mode={formMode}
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
                  <th className="px-3 py-2 text-right text-xs font-medium text-[var(--color-text-muted)]">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => {
                  const isSale = p.quantity < 0;
                  return (
                  <tr key={p.id} className={`border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-card)]/50 ${isSale ? "bg-[var(--color-negative)]/5" : ""}`}>
                    {editingId === p.id ? (
                      <>
                        <td className="px-3 py-1.5">
                          <input
                            type="date"
                            value={editData.purchase_date}
                            onChange={(e) => setEditData({ ...editData, purchase_date: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-medium">
                          <div className="flex items-center gap-2">
                            <TickerLogo ticker={p.ticker!} type={p.asset_type!} size={20} />
                            {p.ticker}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{p.asset_type}</td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            step="any"
                            value={editData.quantity}
                            onChange={(e) => setEditData({ ...editData, quantity: e.target.value })}
                            className="w-24 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            step="any"
                            value={editData.unit_price}
                            onChange={(e) => setEditData({ ...editData, unit_price: e.target.value })}
                            className="w-28 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-medium text-[var(--color-text-muted)]">
                          {formatBRL(parseFloat(editData.quantity) * parseFloat(editData.unit_price) || 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => saveEdit(p.id)}
                              disabled={saving}
                              className="text-xs text-[var(--color-positive)] hover:underline disabled:opacity-50"
                            >
                              {saving ? "..." : "Salvar"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-xs text-[var(--color-text-muted)] hover:underline"
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5">
                          {new Date(p.purchase_date + "T00:00:00").toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-3 py-2.5 font-medium">
                          <div className="flex items-center gap-2">
                            <TickerLogo ticker={p.ticker!} type={p.asset_type!} size={20} />
                            {p.ticker}
                            {isSale && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-negative)]/15 text-[var(--color-negative)]">
                                VENDA
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{p.asset_type}</td>
                        <td className={`px-3 py-2.5 ${isSale ? "text-[var(--color-negative)]" : ""}`}>
                          {formatQuantity(p.quantity)}
                        </td>
                        <td className="px-3 py-2.5">{formatBRL(p.unit_price)}</td>
                        <td className={`px-3 py-2.5 font-medium ${isSale ? "text-[var(--color-negative)]" : ""}`}>
                          {formatBRL(p.total_value)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEdit(p)}
                              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                              title="Editar"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                <path d="m15 5 4 4"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="text-[var(--color-text-muted)] hover:text-[var(--color-negative)] transition-colors"
                              title="Remover"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
