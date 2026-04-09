"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { CurrencyCode, SavedPlan, ClassRebalancing } from "@/types";
import { formatBRL, formatCurrency, formatPercent } from "@/lib/format";
import {
  ChevronLeft,
  ShieldCheck,
  CheckCircle2,
  Circle,
  MoveVertical,
} from "lucide-react";
import TickerLogo from "@/components/ticker-logo";
import Link from "next/link";

const CLASS_COLORS: Record<string, string> = {
  STOCK: "#3b82f6",
  ACAO: "#10b981",
  STOCK_BR: "#10b981",
  STOCK_US: "#3b82f6",
  ETF_INTL: "#0ea5e9",
  FII: "#f59e0b",
  RF: "#8b5cf6",
  RESERVA: "#06b6d4",
};

export default function SavedPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingChecks, setSavingChecks] = useState(false);
  const [topRulerIndex, setTopRulerIndex] = useState<number | null>(null);
  const [bottomRulerIndex, setBottomRulerIndex] = useState<number | null>(null);
  const [topRulerTop, setTopRulerTop] = useState<number | null>(null);
  const [bottomRulerTop, setBottomRulerTop] = useState<number | null>(null);
  const [draggingRuler, setDraggingRuler] = useState<"top" | "bottom" | null>(
    null
  );
  const tableCanvasRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const rowByIdRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const flipPositions = useRef<Map<number, number>>(new Map());
  const flipPending = useRef(false);

  const sortItems = (items: SavedPlan["items"]) => {
    const unchecked = items.filter((i) => !i.checked);
    const checked = items.filter((i) => i.checked);
    return [...unchecked, ...checked];
  };

  const fetchPlan = useCallback(async () => {
    try {
      const data = await apiFetch<SavedPlan>(`/saved-plans/${id}`);
      setPlan({ ...data, items: sortItems(data.items) });
    } catch {
      toast.error("Erro ao carregar plano");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // FLIP animation: after reorder, animate rows from old position to new
  useLayoutEffect(() => {
    if (!flipPending.current) return;
    flipPending.current = false;

    rowByIdRefs.current.forEach((row, itemId) => {
      const oldTop = flipPositions.current.get(itemId);
      if (oldTop == null) return;
      const newTop = row.getBoundingClientRect().top;
      const delta = oldTop - newTop;
      if (delta === 0) return;

      row.style.transition = "none";
      row.style.transform = `translateY(${delta}px)`;

      requestAnimationFrame(() => {
        row.style.transition = "transform 300ms ease";
        row.style.transform = "";
        row.addEventListener(
          "transitionend",
          () => { row.style.transition = ""; },
          { once: true }
        );
      });
    });

    flipPositions.current.clear();
  });

  useEffect(() => {
    const uncheckedCount = plan?.items.filter((item) => !item.checked).length ?? 0;

    if (!plan?.items.length || uncheckedCount <= 0) {
      setTopRulerIndex(null);
      setBottomRulerIndex(null);
      return;
    }

    const lastIndex = uncheckedCount - 1;

    setTopRulerIndex((prev) => {
      if (prev == null) return 0;
      return Math.min(prev, lastIndex);
    });

    setBottomRulerIndex((prev) => {
      if (prev == null) return lastIndex;
      return Math.min(prev, lastIndex);
    });
  }, [plan?.items]);

  useEffect(() => {
    if (topRulerIndex == null || bottomRulerIndex == null) return;
    if (topRulerIndex > bottomRulerIndex) {
      setTopRulerIndex(bottomRulerIndex);
    }
  }, [topRulerIndex, bottomRulerIndex]);

  const updateRulerPositions = useCallback(() => {
    const canvas = tableCanvasRef.current;
    if (!canvas) {
      setTopRulerTop(null);
      setBottomRulerTop(null);
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const topRow = topRulerIndex == null ? null : rowRefs.current[topRulerIndex];
    const bottomRow =
      bottomRulerIndex == null ? null : rowRefs.current[bottomRulerIndex];

    if (!topRow) {
      setTopRulerTop(null);
    } else {
      const topRowRect = topRow.getBoundingClientRect();
      setTopRulerTop(topRowRect.top - canvasRect.top);
    }

    if (!bottomRow) {
      setBottomRulerTop(null);
    } else {
      const bottomRowRect = bottomRow.getBoundingClientRect();
      setBottomRulerTop(bottomRowRect.bottom - canvasRect.top);
    }
  }, [topRulerIndex, bottomRulerIndex]);

  useEffect(() => {
    updateRulerPositions();
  }, [updateRulerPositions, plan?.items.length]);

  useEffect(() => {
    const canvas = tableCanvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      updateRulerPositions();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [updateRulerPositions, plan?.items.length]);

  const getClosestRowIndex = useCallback(
    (clientY: number, ruler: "top" | "bottom") => {
      const uncheckedCount = plan?.items.filter((item) => !item.checked).length ?? 0;
      if (uncheckedCount <= 0) return 0;

      let closestIndex = 0;
      let smallestDistance = Number.POSITIVE_INFINITY;

      rowRefs.current.forEach((row, index) => {
        if (index >= uncheckedCount) return;
        if (!row) return;
        const rect = row.getBoundingClientRect();
        const anchorY = ruler === "top" ? rect.top : rect.bottom;
        const distance = Math.abs(clientY - anchorY);
        if (distance < smallestDistance) {
          smallestDistance = distance;
          closestIndex = index;
        }
      });

      return closestIndex;
    },
    [plan?.items]
  );

  useEffect(() => {
    if (!draggingRuler) return;

    const handlePointerMove = (event: PointerEvent) => {
      const closestIndex = getClosestRowIndex(event.clientY, draggingRuler);

      if (draggingRuler === "top") {
        setTopRulerIndex(
          bottomRulerIndex == null
            ? closestIndex
            : Math.min(closestIndex, bottomRulerIndex)
        );
        return;
      }

      setBottomRulerIndex(
        topRulerIndex == null ? closestIndex : Math.max(closestIndex, topRulerIndex)
      );
    };

    const stopDragging = () => {
      setDraggingRuler(null);
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [draggingRuler, getClosestRowIndex, topRulerIndex, bottomRulerIndex]);

  const handleRulerPointerDown = (ruler: "top" | "bottom", clientY: number) => {
    const closestIndex = getClosestRowIndex(clientY, ruler);

    if (ruler === "top") {
      setTopRulerIndex(
        bottomRulerIndex == null
          ? closestIndex
          : Math.min(closestIndex, bottomRulerIndex)
      );
      setDraggingRuler("top");
      return;
    }

    setBottomRulerIndex(
      topRulerIndex == null ? closestIndex : Math.max(closestIndex, topRulerIndex)
    );
    setDraggingRuler("bottom");
  };

  const toggleCheck = async (itemId: number) => {
    if (!plan) return;
    const toggled = plan.items.map((item) =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    // Show check immediately, then reorder after a short delay (Apple Notes style)
    setPlan({ ...plan, items: toggled });
    await new Promise((r) => setTimeout(r, 350));

    // Capture current positions for FLIP animation
    rowByIdRefs.current.forEach((row, itemId) => {
      flipPositions.current.set(itemId, row.getBoundingClientRect().top);
    });
    flipPending.current = true;

    const updated = sortItems(toggled);
    setPlan({ ...plan, items: updated });

    setSavingChecks(true);
    try {
      const checkedIds = updated.filter((i) => i.checked).map((i) => i.id);
      await apiFetch(`/saved-plans/${id}/checks`, {
        method: "PUT",
        body: JSON.stringify({ checked_item_ids: checkedIds }),
      });
    } catch {
      toast.error("Erro ao salvar progresso");
      // revert
      setPlan((prev) => {
        if (!prev) return prev;
        const reverted = prev.items.map((item) =>
          item.id === itemId ? { ...item, checked: !item.checked } : item
        );
        return { ...prev, items: sortItems(reverted) };
      });
    } finally {
      setSavingChecks(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-8">
        Carregando...
      </p>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-4">
        <Link
          href="/desejados/salvos"
          className="flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <ChevronLeft size={16} /> Voltar
        </Link>
        <p className="text-sm text-[var(--color-negative)]">
          Plano não encontrado.
        </p>
      </div>
    );
  }

  const classBreakdown: ClassRebalancing[] = (() => {
    try {
      return JSON.parse(plan.class_breakdown_json);
    } catch {
      return [];
    }
  })();

  const checkedCount = plan.items.filter((i) => i.checked).length;
  const totalItems = plan.items.length;
  const uncheckedCount = totalItems - checkedCount;
  const progress = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;

  const totalPlannedBrl = plan.items.reduce(
    (sum, i) => sum + Number(i.amount_to_invest),
    0
  );
  const nativeTotals = plan.items.reduce(
    (acc, item) => {
      if (!item.quote_currency || item.quote_currency === "BRL" || item.amount_to_invest_native == null) {
        return acc;
      }
      acc[item.quote_currency] =
        (acc[item.quote_currency] ?? 0) + Number(item.amount_to_invest_native);
      return acc;
    },
    {} as Partial<Record<CurrencyCode, number>>
  );
  const formatNativeTotals = (totals: Partial<Record<CurrencyCode, number>>) => {
    const entries = Object.entries(totals).filter(([, value]) => Number(value) > 0);
    if (entries.length === 0) return "—";
    return entries
      .map(([currency, value]) => formatCurrency(value, currency as CurrencyCode))
      .join(" · ");
  };
  const selectedStartIndex =
    topRulerIndex == null || bottomRulerIndex == null
      ? null
      : Math.min(topRulerIndex, bottomRulerIndex);
  const selectedEndIndex =
    topRulerIndex == null || bottomRulerIndex == null
      ? null
      : Math.max(topRulerIndex, bottomRulerIndex);
  const selectedItems =
    selectedStartIndex == null || selectedEndIndex == null
      ? []
      : plan.items
          .slice(selectedStartIndex, selectedEndIndex + 1)
          .filter((item) => !item.checked);
  const rulerSumBrl =
    selectedItems.reduce(
      (sum, item) => sum + Number(item.amount_to_invest),
      0
    );
  const rulerNativeTotals = selectedItems.reduce(
    (acc, item) => {
      if (!item.quote_currency || item.quote_currency === "BRL" || item.amount_to_invest_native == null) {
        return acc;
      }
      acc[item.quote_currency] =
        (acc[item.quote_currency] ?? 0) + Number(item.amount_to_invest_native);
      return acc;
    },
    {} as Partial<Record<CurrencyCode, number>>
  );
  const topRulerLabel =
    topRulerIndex == null ? null : plan.items[topRulerIndex]?.is_reserve
      ? "Reserva"
      : plan.items[topRulerIndex]?.ticker;
  const bottomRulerLabel =
    bottomRulerIndex == null ? null : plan.items[bottomRulerIndex]?.is_reserve
      ? "Reserva"
      : plan.items[bottomRulerIndex]?.ticker;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/desejados/salvos"
          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-card)] transition-colors"
        >
          <ChevronLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{plan.label}</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {new Date(plan.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Progresso</span>
          <span className="text-sm text-[var(--color-text-muted)]">
            {checkedCount}/{totalItems} concluídos ({progress}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-[var(--color-border)]/40">
          <div
            className="h-full rounded-full bg-[var(--color-positive)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
          <span className="block text-[10px] text-[var(--color-text-muted)]">
            Aporte
          </span>
          <span className="text-sm font-semibold">
            {formatBRL(plan.contribution)}
          </span>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
          <span className="block text-[10px] text-[var(--color-text-muted)]">
            Total Planejado
          </span>
          <span className="text-sm font-semibold">
            {formatBRL(totalPlannedBrl)}
          </span>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
          <span className="block text-[10px] text-[var(--color-text-muted)]">
            Patrimônio Atual
          </span>
          <span className="text-sm font-semibold">
            {formatBRL(plan.patrimonio_atual)}
          </span>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
          <span className="block text-[10px] text-[var(--color-text-muted)]">
            Patrimônio Pós-Aporte
          </span>
          <span className="text-sm font-semibold">
            {formatBRL(plan.patrimonio_pos_aporte)}
          </span>
        </div>
      </div>

      {/* Class breakdown */}
      {classBreakdown.length > 0 && (
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3">
            Distribuição por Classe
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Classe
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Meta %
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Atual %
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Gap (R$)
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {classBreakdown.map((c) => (
                  <tr
                    key={c.allocation_bucket}
                    className="border-b border-[var(--color-border)]/50"
                  >
                    <td className="px-3 py-2">{c.label}</td>
                    <td className="px-3 py-2">
                      {formatPercent(c.target_pct)}
                    </td>
                    <td className="px-3 py-2">
                      {formatPercent(c.current_pct)}
                    </td>
                    <td
                      className={`px-3 py-2 ${Number(c.gap) >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}
                    >
                      {formatBRL(c.gap)}
                    </td>
                    <td className="px-3 py-2">
                      {c.status === "—" ? (
                        <span className="text-xs text-[var(--color-text-muted)]">
                          —
                        </span>
                      ) : (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            c.status === "APORTAR"
                              ? "bg-[var(--color-positive)]/15 text-[var(--color-positive)]"
                              : "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                          }`}
                        >
                          {c.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Items checklist */}
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text-secondary)]">
              Plano por Ativo
            </h2>
            {uncheckedCount > 0 && (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Arraste as réguas superior e inferior para somar as colunas de
                aporte entre as linhas selecionadas.
              </p>
            )}
          </div>
          <div className="text-right">
            {selectedStartIndex != null && selectedEndIndex != null && (
              <div className="space-y-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
                <p>
                  Intervalo: {topRulerLabel ?? "—"} até {bottomRulerLabel ?? "—"}
                </p>
                <p>Total no intervalo: {formatBRL(rulerSumBrl)}</p>
                <p>Nativo no intervalo: {formatNativeTotals(rulerNativeTotals)}</p>
              </div>
            )}
            {savingChecks && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                Salvando...
              </span>
            )}
          </div>
        </div>

        <div className="relative overflow-x-auto">
          <div ref={tableCanvasRef} className="relative min-w-max">
            {topRulerTop != null && bottomRulerTop != null && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 bg-cyan-400/5"
                style={{
                  top: topRulerTop,
                  height: Math.max(bottomRulerTop - topRulerTop, 0),
                }}
              />
            )}

            {topRulerTop != null && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-cyan-400/80"
                style={{ top: topRulerTop }}
              />
            )}

            {bottomRulerTop != null && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-cyan-400/80"
                style={{ top: bottomRulerTop }}
              />
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] w-10"></th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Ticker
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Classe
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Valor Atual
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Valor Alvo
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Gap
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Aportar (R$)
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                    Aportar (Nativo)
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.items.map((item, index) => {
                  const isInsideRuler =
                    selectedStartIndex != null &&
                    selectedEndIndex != null &&
                    index >= selectedStartIndex &&
                    index <= selectedEndIndex;

                  return (
                    <tr
                      key={item.id}
                      ref={(node) => {
                        rowRefs.current[index] = node;
                        if (node) {
                          rowByIdRefs.current.set(item.id, node);
                        }
                      }}
                      className={`border-b border-[var(--color-border)]/50 transition-colors ${
                        item.is_reserve
                          ? "bg-cyan-500/5"
                          : item.checked
                            ? "bg-[var(--color-positive)]/5"
                            : ""
                      } ${isInsideRuler ? "bg-cyan-400/10" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <button
                          onClick={() => toggleCheck(item.id)}
                          className="p-0.5 transition-colors"
                        >
                          {item.checked ? (
                            <CheckCircle2
                              size={20}
                              className="text-[var(--color-positive)]"
                            />
                          ) : (
                            <Circle
                              size={20}
                              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                            />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {item.is_reserve ? (
                          <div className="flex items-center gap-2 text-cyan-400">
                            <ShieldCheck size={20} />
                            Reserva Financeira
                          </div>
                        ) : (
                          <div
                            className={`flex items-center gap-2 ${item.checked ? "line-through opacity-60" : ""}`}
                          >
                            <TickerLogo
                              ticker={item.ticker}
                              size={20}
                            />
                            {item.ticker}
                          </div>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 ${item.is_reserve ? "text-cyan-400 text-xs font-semibold" : "text-[var(--color-text-secondary)]"} ${item.checked && !item.is_reserve ? "line-through opacity-60" : ""}`}
                      >
                        {item.is_reserve ? "PRIORIDADE" : item.asset_class}
                      </td>
                      <td
                        className={`px-3 py-2 ${item.checked ? "line-through opacity-60" : ""}`}
                      >
                        {formatBRL(item.current_value)}
                      </td>
                      <td
                        className={`px-3 py-2 ${item.checked ? "line-through opacity-60" : ""}`}
                      >
                        {formatBRL(item.target_value)}
                      </td>
                      <td
                        className={`px-3 py-2 ${item.is_reserve ? "text-cyan-400" : "text-[var(--color-positive)]"} ${item.checked ? "line-through opacity-60" : ""}`}
                      >
                        {formatBRL(item.gap)}
                      </td>
                      <td
                        className={`px-3 py-2 font-bold ${item.is_reserve ? "text-cyan-400" : ""} ${item.checked ? "line-through opacity-60" : ""}`}
                      >
                        {formatBRL(item.amount_to_invest)}
                      </td>
                      <td
                        className={`px-3 py-2 text-[var(--color-text-muted)] ${item.checked ? "line-through opacity-60" : ""}`}
                      >
                        {item.quote_currency &&
                        item.quote_currency !== "BRL" &&
                        item.amount_to_invest_native
                          ? formatCurrency(item.amount_to_invest_native, item.quote_currency)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] font-bold">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" colSpan={5}>
                    TOTAL PLANEJADO
                  </td>
                  <td className="px-3 py-2">{formatBRL(totalPlannedBrl)}</td>
                  <td className="px-3 py-2">
                    {formatNativeTotals(nativeTotals)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {topRulerTop != null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-30"
              style={{ top: topRulerTop }}
            >
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  handleRulerPointerDown("top", event.clientY);
                }}
                className="pointer-events-auto absolute left-2 -top-4 flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/50 bg-slate-950/90 text-cyan-300 shadow-lg transition-colors hover:bg-slate-900 cursor-row-resize"
                aria-label="Arrastar régua superior"
              >
                <MoveVertical size={16} />
              </button>
              <div className="absolute right-2 -top-5 rounded-full border border-cyan-400/40 bg-slate-950/95 px-3 py-1.5 text-xs text-cyan-100 shadow-lg">
                Início: {topRulerLabel ?? "—"}
              </div>
            </div>
          )}

          {bottomRulerTop != null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-30"
              style={{ top: bottomRulerTop }}
            >
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  handleRulerPointerDown("bottom", event.clientY);
                }}
                className="pointer-events-auto absolute left-2 -top-4 flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/50 bg-slate-950/90 text-cyan-300 shadow-lg transition-colors hover:bg-slate-900 cursor-row-resize"
                aria-label="Arrastar régua inferior"
              >
                <MoveVertical size={16} />
              </button>
              <div className="absolute right-2 -top-5 rounded-full border border-cyan-400/40 bg-slate-950/95 px-3 py-1.5 text-xs text-cyan-100 shadow-lg">
                Fim: {bottomRulerLabel ?? "—"} • {formatBRL(rulerSumBrl)}
                {formatNativeTotals(rulerNativeTotals) !== "—"
                  ? ` • ${formatNativeTotals(rulerNativeTotals)}`
                  : ""}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
