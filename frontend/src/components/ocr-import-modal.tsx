"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { X, Upload, Camera, Trash2, AlertTriangle, Check, Link, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  OcrUploadResponse,
  OcrBatchStatus,
  OcrExtractedOperation,
  TickerResolution,
  TickerResolveResponse,
  BulkPurchaseItem,
  Purchase,
} from "@/types";
import TickerLogo from "@/components/ticker-logo";

interface OcrImportModalProps {
  onClose: () => void;
  onSaved: () => void;
}

type ModalStep = "upload" | "processing" | "review" | "result";

interface ReviewRow extends OcrExtractedOperation {
  id: string;
  sourceJobId: string;
  resolution: TickerResolution | null;
}

interface ImageGroup {
  jobId: string;
  imageUrl: string;
  fileName: string;
  rows: ReviewRow[];
  error: string | null;
}

export default function OcrImportModal({ onClose, onSaved }: OcrImportModalProps) {
  const [step, setStep] = useState<ModalStep>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Processing state
  const [batchId, setBatchId] = useState<string | null>(null);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [completedJobs, setCompletedJobs] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);

  // Mapping: job_id -> { imageUrl, fileName }
  const [jobImageMap, setJobImageMap] = useState<Map<string, { imageUrl: string; fileName: string }>>(new Map());

  // Review state
  const [imageGroups, setImageGroups] = useState<ImageGroup[]>([]);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Result state
  const [createdCount, setCreatedCount] = useState(0);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      jobImageMap.forEach((v) => URL.revokeObjectURL(v.imageUrl));
    };
  }, [jobImageMap]);

  const resolveTickerMap = useCallback(async (tickers: string[]) => {
    const normalizedTickers = [
      ...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)),
    ];
    if (normalizedTickers.length === 0) return new Map<string, TickerResolution>();

    const resolution = await apiFetch<TickerResolveResponse>(
      "/ocr/resolve-tickers",
      { method: "POST", body: JSON.stringify({ tickers: normalizedTickers }) }
    );
    return new Map(resolution.resolutions.map((r) => [r.ticker, r]));
  }, []);

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).filter((f) =>
      ["image/png", "image/jpeg", "image/webp"].includes(f.type)
    );
    if (arr.length === 0) {
      toast.error("Formato nao suportado. Use PNG, JPG ou WebP.");
      return;
    }
    setFiles((prev) => {
      const combined = [...prev, ...arr].slice(0, 5);
      if (prev.length + arr.length > 5) {
        toast.error("Maximo de 5 imagens por upload");
      }
      return combined;
    });
  }, []);

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const startUpload = async () => {
    if (files.length === 0) return;

    setStep("processing");
    setProcessingError(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/ocr/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload falhou" }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data: OcrUploadResponse = await res.json();
      setBatchId(data.batch_id);
      setJobIds(data.job_ids);

      // Map each job_id to its source image (order matches files array)
      const map = new Map<string, { imageUrl: string; fileName: string }>();
      data.job_ids.forEach((jid, i) => {
        const file = files[i];
        if (file) {
          map.set(jid, {
            imageUrl: URL.createObjectURL(file),
            fileName: file.name,
          });
        }
      });
      setJobImageMap(map);
    } catch (err) {
      setProcessingError(err instanceof Error ? err.message : "Erro no upload");
      setStep("upload");
    }
  };

  // Poll for batch completion
  useEffect(() => {
    if (!batchId || step !== "processing") return;

    let cancelled = false;
    let elapsed = 0;
    const POLL_INTERVAL = 2000;
    const MAX_DURATION = 120000;

    const poll = async () => {
      if (cancelled || elapsed >= MAX_DURATION) {
        if (elapsed >= MAX_DURATION) {
          setProcessingError("Tempo limite excedido. Tente novamente.");
          setStep("upload");
        }
        return;
      }

      try {
        const batch = await apiFetch<OcrBatchStatus>(`/ocr/batch/${batchId}`);
        const done = batch.jobs.filter(
          (j) => j.status === "completed" || j.status === "failed"
        ).length;
        setCompletedJobs(done);

        if (batch.status === "completed" || batch.status === "failed") {
          // Collect all tickers for resolution
          const allTickers: string[] = [];
          for (const job of batch.jobs) {
            if (job.status === "completed" && job.result) {
              allTickers.push(...job.result.operations.map((op) => op.ticker));
            }
          }

          let resMap: Map<string, TickerResolution>;
          try {
            resMap = await resolveTickerMap(allTickers);
          } catch (err) {
            setProcessingError(
              err instanceof Error ? err.message : "Erro ao resolver ativos extraidos"
            );
            setStep("upload");
            return;
          }

          // Build image groups
          const groups: ImageGroup[] = [];
          let rowCounter = 0;

          for (const job of batch.jobs) {
            const imgInfo = jobImageMap.get(job.job_id);
            if (!imgInfo) continue;

            const rows: ReviewRow[] = [];
            if (job.status === "completed" && job.result) {
              for (const op of job.result.operations) {
                const ticker = op.ticker.toUpperCase();
                rows.push({
                  ...op,
                  id: `${rowCounter++}`,
                  ticker,
                  sourceJobId: job.job_id,
                  resolution: resMap.get(ticker) || null,
                });
              }
            }

            groups.push({
              jobId: job.job_id,
              imageUrl: imgInfo.imageUrl,
              fileName: imgInfo.fileName,
              rows,
              error: job.status === "failed" ? (job.error || "Erro no processamento") : null,
            });
          }

          if (groups.every((g) => g.rows.length === 0 && !g.error)) {
            setProcessingError("Nenhuma operacao encontrada nas imagens.");
            setStep("upload");
            return;
          }

          setImageGroups(groups);
          setCurrentImageIdx(0);
          setStep("review");
          return;
        }
      } catch {
        // Silently retry on network errors during polling
      }

      elapsed += POLL_INTERVAL;
      setTimeout(poll, POLL_INTERVAL);
    };

    poll();
    return () => { cancelled = true; };
  }, [batchId, jobImageMap, resolveTickerMap, step]);

  const currentGroup = imageGroups[currentImageIdx] || null;

  const updateRow = (groupIdx: number, rowId: string, field: keyof ReviewRow, value: string | number) => {
    setImageGroups((prev) =>
      prev.map((g, gi) => {
        if (gi !== groupIdx) return g;
        return {
          ...g,
          rows: g.rows.map((r) => {
            if (r.id !== rowId) return r;
            if (field === "ticker" && typeof value === "string") {
              return { ...r, ticker: value.toUpperCase(), resolution: null };
            }
            return { ...r, [field]: value };
          }),
        };
      })
    );
  };

  const resolveRowTicker = async (groupIdx: number, rowId: string, ticker: string) => {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return;

    try {
      const resMap = await resolveTickerMap([normalized]);
      const resolution = resMap.get(normalized) || null;
      setImageGroups((prev) =>
        prev.map((g, gi) => {
          if (gi !== groupIdx) return g;
          return {
            ...g,
            rows: g.rows.map((r) =>
              r.id === rowId ? { ...r, ticker: normalized, resolution } : r
            ),
          };
        })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao resolver ticker");
    }
  };

  const deleteRow = (groupIdx: number, rowId: string) => {
    setImageGroups((prev) =>
      prev.map((g, gi) => {
        if (gi !== groupIdx) return g;
        return { ...g, rows: g.rows.filter((r) => r.id !== rowId) };
      })
    );
  };

  const linkAsset = async (groupIdx: number, ticker: string) => {
    try {
      await apiFetch<{ asset_id: number }>(
        `/ocr/link-asset?ticker=${encodeURIComponent(ticker)}`,
        { method: "POST" }
      );
      const resMap = await resolveTickerMap([ticker]);
      const resolution = resMap.get(ticker);

      if (!resolution) {
        throw new Error("Ativo vinculado, mas nao foi possivel atualizar");
      }

      setImageGroups((prev) =>
        prev.map((g, gi) => {
          if (gi !== groupIdx) return g;
          return {
            ...g,
            rows: g.rows.map((r) =>
              r.ticker === ticker ? { ...r, resolution } : r
            ),
          };
        })
      );
      toast.success(`${ticker} adicionado ao catalogo`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar ativo");
    }
  };

  // All rows across all groups
  const allRows = useMemo(() => imageGroups.flatMap((g) => g.rows), [imageGroups]);
  const linkedRows = useMemo(() => allRows.filter((r) => r.resolution?.state === "linked" && r.resolution.asset_id), [allRows]);
  const skippedCount = allRows.length - linkedRows.length;

  const confirmAndCreate = async () => {
    if (linkedRows.length === 0) {
      toast.error("Nenhum aporte valido para criar. Vincule os ativos primeiro.");
      return;
    }

    setSubmitting(true);
    try {
      const items: BulkPurchaseItem[] = linkedRows.map((r) => {
        const qty = r.operation_type === "venda" ? -Math.abs(r.quantity) : Math.abs(r.quantity);
        return {
          asset_id: r.resolution!.asset_id!,
          purchase_date: r.date,
          quantity: qty,
          total_value: r.total_value,
          trade_currency: r.resolution?.quote_currency || "BRL",
          fx_rate: r.resolution?.fx_rate_to_brl || null,
        };
      });

      const created = await apiFetch<Purchase[]>("/ocr/purchases/bulk", {
        method: "POST",
        body: JSON.stringify({ items }),
      });

      setCreatedCount(created.length);
      setStep("result");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar aportes");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[var(--color-accent)]" />
            <h2 className="text-lg font-semibold">Importar via Imagem</h2>
            {step === "review" && imageGroups.length > 1 && (
              <span className="text-xs text-[var(--color-text-muted)] ml-2">
                Imagem {currentImageIdx + 1} de {imageGroups.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-bg-main)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* STEP: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-text-muted)]">
                Envie screenshots do app da corretora. O sistema extraira automaticamente os aportes.
              </p>

              {processingError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {processingError}
                </div>
              )}

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                    : "border-[var(--color-border)] hover:border-[var(--color-accent)]/50"
                }`}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-muted)]" />
                <p className="text-sm font-medium">Arraste imagens ou clique para selecionar</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  PNG, JPG ou WebP. Max 5 imagens, 5MB cada.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{files.length} imagem(ns) selecionada(s)</p>
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)]"
                    >
                      <span className="text-sm truncate max-w-[80%]">{f.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="p-1 rounded hover:bg-red-500/10 text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP: Processing */}
          {step === "processing" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-12 h-12 border-4 border-[var(--color-accent)]/30 border-t-[var(--color-accent)] rounded-full animate-spin" />
              <p className="text-sm font-medium">Processando imagens...</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {completedJobs}/{jobIds.length} imagem(ns) processada(s)
              </p>
            </div>
          )}

          {/* STEP: Review — image + operations side by side */}
          {step === "review" && currentGroup && (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)]">
                  <span className="text-xs text-[var(--color-text-muted)]">Total</span>
                  <span className="text-sm font-semibold">{allRows.length}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/5 border border-green-500/20">
                  <Check className="w-3 h-3 text-green-400" />
                  <span className="text-sm font-semibold text-green-400">{linkedRows.length}</span>
                </div>
                {skippedCount > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                    <AlertTriangle className="w-3 h-3 text-yellow-400" />
                    <span className="text-sm font-semibold text-yellow-400">{skippedCount}</span>
                    <span className="text-xs text-yellow-400/70">pendente(s)</span>
                  </div>
                )}
              </div>

              {/* Side-by-side: image left, operations right */}
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Image preview */}
                <div className="lg:w-2/5 shrink-0">
                  <div className="sticky top-0 space-y-2">
                    <div className="text-xs text-[var(--color-text-muted)] font-medium truncate">
                      {currentGroup.fileName}
                    </div>
                    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-black/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentGroup.imageUrl}
                        alt={currentGroup.fileName}
                        className="w-full max-h-[50vh] object-contain"
                      />
                    </div>

                    {/* Image navigation */}
                    {imageGroups.length > 1 && (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setCurrentImageIdx((i) => Math.max(0, i - 1))}
                          disabled={currentImageIdx === 0}
                          className="p-1.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-main)] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="flex gap-1">
                          {imageGroups.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setCurrentImageIdx(i)}
                              className={`w-2 h-2 rounded-full transition-colors ${
                                i === currentImageIdx
                                  ? "bg-[var(--color-accent)]"
                                  : "bg-[var(--color-border)] hover:bg-[var(--color-text-muted)]"
                              }`}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => setCurrentImageIdx((i) => Math.min(imageGroups.length - 1, i + 1))}
                          disabled={currentImageIdx === imageGroups.length - 1}
                          className="p-1.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-main)] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Operations for this image */}
                <div className="lg:w-3/5 space-y-2">
                  {currentGroup.error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                      Erro ao processar esta imagem: {currentGroup.error}
                    </div>
                  )}

                  {currentGroup.rows.length === 0 && !currentGroup.error && (
                    <div className="text-center py-8 text-sm text-[var(--color-text-muted)]">
                      Nenhuma operacao extraida desta imagem.
                    </div>
                  )}

                  {currentGroup.rows.map((row) => {
                    const state = row.resolution?.state;
                    const isLinked = state === "linked";
                    const borderColor = isLinked
                      ? "border-green-500/20"
                      : state === "global_unlinked"
                        ? "border-blue-500/20"
                        : "border-yellow-500/20";

                    return (
                      <div
                        key={row.id}
                        className={`rounded-xl border ${borderColor} bg-[var(--color-bg-main)] p-3 transition-colors`}
                      >
                        {/* Top: ticker + status + delete */}
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-2">
                            {isLinked ? (
                              <TickerLogo ticker={row.ticker} size={28} />
                            ) : (
                              <div className="w-7 h-7 rounded-lg bg-[var(--color-border)] flex items-center justify-center">
                                <span className="text-[10px] font-bold text-[var(--color-text-muted)]">?</span>
                              </div>
                            )}
                            <input
                              value={row.ticker}
                              onChange={(e) => updateRow(currentImageIdx, row.id, "ticker", e.target.value)}
                              onBlur={(e) => resolveRowTicker(currentImageIdx, row.id, e.currentTarget.value)}
                              className="w-24 px-2 py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-sm font-semibold tracking-wide"
                            />
                            {isLinked && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-[11px] font-medium text-green-400">
                                <Check className="w-3 h-3" /> Vinculado
                              </span>
                            )}
                            {state === "global_unlinked" && (
                              <button
                                onClick={() => linkAsset(currentImageIdx, row.ticker)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-[11px] font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
                              >
                                <Link className="w-3 h-3" /> Vincular ao catalogo
                              </button>
                            )}
                            {(state === "unknown" || !state) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 text-[11px] font-medium text-yellow-400">
                                <AlertTriangle className="w-3 h-3" /> Nao encontrado
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => deleteRow(currentImageIdx, row.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Bottom: fields grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Data</label>
                            <input
                              type="date"
                              value={row.date}
                              onChange={(e) => updateRow(currentImageIdx, row.id, "date", e.target.value)}
                              className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-sm"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Quantidade</label>
                            <input
                              type="number"
                              value={row.quantity}
                              onChange={(e) => updateRow(currentImageIdx, row.id, "quantity", parseFloat(e.target.value) || 0)}
                              className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-sm"
                              step="any"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Valor Total</label>
                            <input
                              type="number"
                              value={row.total_value}
                              onChange={(e) => updateRow(currentImageIdx, row.id, "total_value", parseFloat(e.target.value) || 0)}
                              className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-sm"
                              step="0.01"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Operacao</label>
                            <select
                              value={row.operation_type}
                              onChange={(e) => updateRow(currentImageIdx, row.id, "operation_type", e.target.value)}
                              className={`px-2 py-1.5 rounded-lg border text-sm font-medium ${
                                row.operation_type === "compra"
                                  ? "border-green-500/30 bg-green-500/5 text-green-400"
                                  : "border-red-500/30 bg-red-500/5 text-red-400"
                              }`}
                            >
                              <option value="compra">Compra</option>
                              <option value="venda">Venda</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP: Result */}
          {step === "result" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-lg font-medium">{createdCount} aporte(s) criado(s)!</p>
              <p className="text-sm text-[var(--color-text-muted)]">
                Os aportes foram adicionados a sua carteira.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--color-border)]">
          <div>
            {step === "review" && imageGroups.length > 1 && (
              <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                {imageGroups.map((g, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImageIdx(i)}
                    className={`px-2 py-1 rounded-md transition-colors ${
                      i === currentImageIdx
                        ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium"
                        : "hover:bg-[var(--color-bg-main)]"
                    }`}
                  >
                    {g.fileName.length > 12 ? g.fileName.slice(0, 10) + "..." : g.fileName}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "upload" && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-main)]"
                >
                  Cancelar
                </button>
                <button
                  onClick={startUpload}
                  disabled={files.length === 0}
                  className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Processar {files.length > 0 ? `(${files.length})` : ""}
                </button>
              </>
            )}

            {step === "review" && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-main)]"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmAndCreate}
                  disabled={submitting || linkedRows.length === 0}
                  className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Criando..." : `Confirmar ${linkedRows.length} aporte(s)`}
                </button>
              </>
            )}

            {step === "result" && (
              <button
                onClick={() => { onSaved(); onClose(); }}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90"
              >
                Fechar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
