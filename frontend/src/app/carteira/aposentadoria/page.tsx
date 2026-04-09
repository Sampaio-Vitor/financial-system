"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { formatBRL } from "@/lib/format";

// --- Types ---

interface RetirementOverview {
  patrimonio_meta: number | null;
  taxa_retirada: number;
  rentabilidade_anual: number;
  patrimonio_atual: number;
  renda_passiva_atual: number;
  renda_passiva_meta: number;
  progresso: number;
  aporte_medio_mensal: number;
  meses_com_aporte: number;
  anos_para_meta: number | null;
}

// --- Helpers ---

function formatBRLShort(value: number): string {
  if (value >= 1_000_000) {
    return `R$${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  }
  if (value >= 1_000) {
    return `R$${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
  }
  return `R$${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

interface ProjectionPoint {
  year: number;
  label: string;
  patrimonio: number;
}

function buildProjection(
  patrimonioInicial: number,
  aporteMensal: number,
  rentabilidadeAnual: number,
  patrimonioMeta: number,
): ProjectionPoint[] {
  const taxaMensal = Math.pow(1 + rentabilidadeAnual / 100, 1 / 12) - 1;
  let patrimonio = patrimonioInicial;
  const points: ProjectionPoint[] = [{ year: 0, label: "Hoje", patrimonio: Math.round(patrimonioInicial) }];

  let metaHit = patrimonioInicial >= patrimonioMeta;

  for (let m = 1; m <= 600; m++) {
    patrimonio = patrimonio * (1 + taxaMensal) + aporteMensal;
    if (!metaHit && patrimonio >= patrimonioMeta) metaHit = true;

    if (m % 12 === 0) {
      const year = m / 12;
      points.push({ year, label: `${year}a`, patrimonio: Math.round(patrimonio) });
      if (metaHit && year >= 5) break; // show at least 5 years after meta
    }
  }
  return points;
}

function runScenario(
  patrimonioInicial: number,
  aporteMensal: number,
  rentabilidade: number,
  patrimonioMeta: number,
  taxaRetirada: number,
): { patrimonioEm10: number; patrimonioEm20: number; anosParaMeta: number | null; rendaMensalEm10: number } {
  const taxaMensal = Math.pow(1 + rentabilidade / 100, 1 / 12) - 1;
  let p = patrimonioInicial;
  let anosParaMeta: number | null = null;
  let p10 = 0;
  let p20 = 0;

  for (let m = 1; m <= 600; m++) {
    p = p * (1 + taxaMensal) + aporteMensal;
    if (anosParaMeta === null && p >= patrimonioMeta) anosParaMeta = m / 12;
    if (m === 120) p10 = p;
    if (m === 240) p20 = p;
  }
  if (!p10) p10 = p;
  if (!p20) p20 = p;

  return { patrimonioEm10: p10, patrimonioEm20: p20, anosParaMeta, rendaMensalEm10: (p10 * taxaRetirada / 100) / 12 };
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--color-bg-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "12px",
  },
  labelStyle: { color: "var(--color-text-muted)" },
};

// --- Main page ---

export default function AposentadoriaPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RetirementOverview | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editMeta, setEditMeta] = useState("");
  const [editTaxa, setEditTaxa] = useState("");
  const [editRent, setEditRent] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const overview = await apiFetch<RetirementOverview>("/retirement/overview");
      setData(overview);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function formatMetaDisplay(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("pt-BR");
  }

  function handleMetaChange(display: string) {
    const digits = display.replace(/\D/g, "");
    setEditMeta(digits);
  }

  function startEditing() {
    if (!data) return;
    setEditMeta(data.patrimonio_meta ? String(data.patrimonio_meta) : "");
    setEditTaxa(String(data.taxa_retirada));
    setEditRent(String(data.rentabilidade_anual));
    setEditing(true);
  }

  async function saveGoal() {
    const meta = parseFloat(editMeta);
    const taxa = parseFloat(editTaxa);
    const rent = parseFloat(editRent);

    if (!Number.isFinite(meta) || meta <= 0) {
      toast.error("Informe uma meta valida");
      return;
    }
    if (!Number.isFinite(taxa) || taxa <= 0 || taxa > 100) {
      toast.error("Taxa de retirada invalida");
      return;
    }
    if (!Number.isFinite(rent) || rent < 0 || rent > 100) {
      toast.error("Rentabilidade invalida");
      return;
    }

    try {
      setSaving(true);
      await apiFetch("/retirement/goal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patrimonio_meta: meta,
          taxa_retirada: taxa,
          rentabilidade_anual: rent,
        }),
      });
      setEditing(false);
      toast.success("Meta salva!");
      await fetchData();
    } catch {
      toast.error("Erro ao salvar meta");
    } finally {
      setSaving(false);
    }
  }

  // Derived data
  const hasGoal = data?.patrimonio_meta != null;
  const metaAtingida = hasGoal && data!.progresso >= 100;

  const projectionData = useMemo(() => {
    if (!data || !data.patrimonio_meta) return [];
    return buildProjection(
      data.patrimonio_atual,
      data.aporte_medio_mensal,
      data.rentabilidade_anual,
      data.patrimonio_meta,
    );
  }, [data]);

  const scenarios = useMemo(() => {
    if (!data || !data.patrimonio_meta) return [];
    const base = data.aporte_medio_mensal;
    return [0.5, 0.75, 1, 1.25, 1.5].map((mult) => ({
      aporte: Math.round(base * mult),
      mult,
      ...runScenario(
        data.patrimonio_atual,
        base * mult,
        data.rentabilidade_anual,
        data.patrimonio_meta!,
        data.taxa_retirada,
      ),
    }));
  }, [data]);

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-6">Aposentadoria</h1>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse h-24 rounded-2xl bg-[var(--color-bg-card)]" />
            ))}
          </div>
          <div className="animate-pulse h-72 rounded-2xl bg-[var(--color-bg-card)]" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-6">Aposentadoria</h1>
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Erro ao carregar dados. Tente novamente.</p>
          <button
            onClick={fetchData}
            className="mt-4 px-5 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with edit button */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Aposentadoria</h1>
        {!editing && (
          <button
            onClick={startEditing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <Pencil size={14} />
            {hasGoal ? "Editar Meta" : "Definir Meta"}
          </button>
        )}
      </div>

      {/* Settings editor */}
      {editing && (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-accent)]/30 p-5">
          <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
            Configuracoes de Aposentadoria
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-[var(--color-text-muted)] block mb-1">Meta de Patrimonio (R$)</label>
              <input
                type="text"
                inputMode="numeric"
                value={formatMetaDisplay(editMeta)}
                onChange={(e) => handleMetaChange(e.target.value)}
                placeholder="5.000.000"
                className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)]"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)] block mb-1">Taxa de Retirada Anual (%)</label>
              <input
                type="number"
                value={editTaxa}
                onChange={(e) => setEditTaxa(e.target.value)}
                step="0.5"
                placeholder="4"
                className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)]"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)] block mb-1">Rentabilidade Anual Esperada (%)</label>
              <input
                type="number"
                value={editRent}
                onChange={(e) => setEditRent(e.target.value)}
                step="0.5"
                placeholder="8"
                className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)]"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={saveGoal}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Check size={14} />
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <X size={14} />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* No goal set state */}
      {!hasGoal && !editing && (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 bg-[var(--color-accent)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🎯</span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-2">
            Defina sua meta de aposentadoria para ver sua projecao.
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mb-4">
            Exemplo: com R$ 5.000.000 e taxa de retirada de 4% ao ano, voce teria {formatBRL((5_000_000 * 0.04) / 12)}/mes de renda passiva.
          </p>
          <button
            onClick={startEditing}
            className="px-5 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90"
          >
            Definir Meta
          </button>
        </div>
      )}

      {/* Dashboard - only when goal is set */}
      {hasGoal && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
                Patrimonio Atual
              </span>
              <div className="text-xl font-bold text-[var(--color-text-primary)] mt-1">
                {formatBRL(data.patrimonio_atual)}
              </div>
            </div>

            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
                Renda Passiva Hoje
              </span>
              <div className="text-xl font-bold text-[var(--color-positive)] mt-1">
                {formatBRL(data.renda_passiva_atual)}
                <span className="text-xs text-[var(--color-text-muted)] font-normal ml-1">/mes</span>
              </div>
            </div>

            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
                Renda na Meta
              </span>
              <div className="text-xl font-bold text-[var(--color-text-primary)] mt-1">
                {formatBRL(data.renda_passiva_meta)}
                <span className="text-xs text-[var(--color-text-muted)] font-normal ml-1">/mes</span>
              </div>
            </div>

            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
                Progresso
              </span>
              <div className="text-xl font-bold text-[var(--color-accent)] mt-1">
                {data.progresso.toFixed(1)}%
              </div>
              <div className="mt-2 w-full h-2 rounded-full bg-[var(--color-border)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(data.progresso, 100)}%`,
                    backgroundColor: metaAtingida ? "var(--color-positive)" : "var(--color-accent)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Goal reached banner */}
          {metaAtingida && (
            <div className="bg-[var(--color-positive)]/10 border border-[var(--color-positive)]/30 rounded-2xl p-5 text-center">
              <p className="text-lg font-bold text-[var(--color-positive)]">
                Parabens! Voce ja atingiu sua meta!
              </p>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                Seu patrimonio atual permite uma renda de {formatBRL(data.renda_passiva_atual)}/mes
                com taxa de retirada de {data.taxa_retirada}% ao ano.
              </p>
            </div>
          )}

          {/* Info cards row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
                Meta de Patrimonio
              </span>
              <div className="text-lg font-bold text-[var(--color-text-primary)] mt-1">
                {formatBRL(data.patrimonio_meta)}
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">
                Taxa de retirada: {data.taxa_retirada}% a.a.
              </span>
            </div>

            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
                Aporte Medio Mensal
              </span>
              <div className="text-lg font-bold text-[var(--color-text-primary)] mt-1">
                {formatBRL(data.aporte_medio_mensal)}
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">
                Baseado em {data.meses_com_aporte} meses de historico
              </span>
            </div>

            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
                Tempo ate a Meta
              </span>
              <div className="text-lg font-bold mt-1">
                {data.anos_para_meta !== null ? (
                  <span className="text-[var(--color-positive)]">
                    {data.anos_para_meta === 0
                      ? "Meta atingida!"
                      : data.anos_para_meta < 1
                        ? `${Math.round(data.anos_para_meta * 12)} meses`
                        : `${data.anos_para_meta} anos`}
                  </span>
                ) : (
                  <span className="text-[var(--color-negative)]">50+ anos</span>
                )}
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">
                Rentabilidade: {data.rentabilidade_anual}% a.a.
              </span>
            </div>
          </div>

          {/* Projection Chart */}
          {projectionData.length > 1 && (
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5">
              <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
                Projecao de Patrimonio
              </h3>

              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={projectionData}>
                  <defs>
                    <linearGradient id="grad-projection" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatBRLShort}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatBRL(value), name]}
                    {...tooltipStyle}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <ReferenceLine
                    y={data.patrimonio_meta!}
                    stroke="var(--color-positive)"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    label={{
                      value: `Meta: ${formatBRLShort(data.patrimonio_meta!)}`,
                      position: "right",
                      fill: "var(--color-positive)",
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="patrimonio"
                    stroke="var(--color-accent)"
                    fill="url(#grad-projection)"
                    strokeWidth={2}
                    dot={false}
                    name="Patrimonio Projetado"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Scenario Table */}
          {scenarios.length > 0 && (
            <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
              <div className="p-4 border-b border-[var(--color-border)]">
                <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  Cenarios de Aporte
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  Baseado no seu aporte medio de {formatBRL(data.aporte_medio_mensal)}/mes
                </p>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-[var(--color-border)]">
                {scenarios.map((s) => (
                  <div
                    key={s.mult}
                    className={`p-4 space-y-2 ${s.mult === 1 ? "bg-[var(--color-accent)]/5" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-[var(--color-text-primary)]">
                        {formatBRL(s.aporte)}/mes
                        {s.mult === 1 && (
                          <span className="ml-2 text-[10px] bg-[var(--color-accent)] text-white px-1.5 py-0.5 rounded">
                            ATUAL
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {s.anosParaMeta !== null
                          ? `${s.anosParaMeta.toFixed(1)}a`
                          : "50a+"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                      <span>10a: {formatBRLShort(s.patrimonioEm10)}</span>
                      <span>Renda 10a: {formatBRL(s.rendaMensalEm10)}/mes</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--color-bg-main)]/30">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-muted)]">Aporte Mensal</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-muted)]">Patrimonio em 10a</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-muted)]">Patrimonio em 20a</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-muted)]">Anos ate Meta</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-muted)]">Renda em 10a</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((s) => (
                      <tr
                        key={s.mult}
                        className={`border-t border-[var(--color-border)]/50 ${
                          s.mult === 1
                            ? "bg-[var(--color-accent)]/5 font-semibold"
                            : "hover:bg-[var(--color-bg-card)]/50"
                        }`}
                      >
                        <td className="px-4 py-2.5 text-[var(--color-text-primary)]">
                          {formatBRL(s.aporte)}/mes
                          {s.mult === 1 && (
                            <span className="ml-2 text-[10px] bg-[var(--color-accent)] text-white px-1.5 py-0.5 rounded">
                              ATUAL
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[var(--color-text-secondary)]">{formatBRL(s.patrimonioEm10)}</td>
                        <td className="px-4 py-2.5 text-right text-[var(--color-text-secondary)]">{formatBRL(s.patrimonioEm20)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {s.anosParaMeta !== null ? (
                            <span className="text-[var(--color-positive)]">{s.anosParaMeta.toFixed(1)} anos</span>
                          ) : (
                            <span className="text-[var(--color-negative)]">50a+</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[var(--color-text-secondary)]">{formatBRL(s.rendaMensalEm10)}/mes</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-[var(--color-text-muted)] text-center px-4">
            Projecao baseada na regra dos 4% (Trinity Study). Resultados reais dependem de condicoes
            de mercado e impostos. Isso nao constitui recomendacao de investimento.
          </p>
        </>
      )}
    </div>
  );
}
