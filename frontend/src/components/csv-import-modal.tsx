"use client";

import { useState, useRef, useCallback } from "react";
import { X, Upload, FileText, ChevronDown, ChevronUp, Download } from "lucide-react";
import readXlsxFile, { type Row } from "read-excel-file/browser";
import { apiFetch } from "@/lib/api";
import { AssetType, BulkAssetResponse } from "@/types";
import TickerLogo from "@/components/ticker-logo";

interface CsvImportModalProps {
  onClose: () => void;
  onSaved: () => void;
}

type ModalStep = "upload" | "preview" | "loading" | "result";

interface ParsedRow {
  ticker: string;
  type: AssetType;
  error?: string;
}

const VALID_TYPES: AssetType[] = ["STOCK", "ACAO", "FII", "RF"];
const CLASS_LABELS: Record<AssetType, string> = {
  STOCK: "Stocks (EUA)",
  ACAO: "Ações (Brasil)",
  FII: "FIIs",
  RF: "Renda Fixa",
};

function parseCsv(text: string): { rows: ParsedRow[]; errors: string[] } {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());

  if (lines.length === 0) {
    return { rows: [], errors: ["Arquivo vazio"] };
  }

  // Detect delimiter: comma vs semicolon
  const firstLine = lines[0];
  const delimiter =
    firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  // Detect header: if second column is NOT a valid type, it's a header
  const firstCols = firstLine.split(delimiter).map((c) => c.trim());
  const isHeader =
    firstCols.length >= 2 &&
    !VALID_TYPES.includes(firstCols[1].toUpperCase() as AssetType);
  const dataLines = isHeader ? lines.slice(1) : lines;

  if (dataLines.length === 0) {
    return { rows: [], errors: ["Nenhuma linha de dados encontrada"] };
  }

  if (dataLines.length > 200) {
    return { rows: [], errors: ["Máximo de 200 linhas por importação"] };
  }

  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < dataLines.length; i++) {
    const lineNum = isHeader ? i + 2 : i + 1;
    const cols = dataLines[i].split(delimiter).map((c) => c.trim());

    if (cols.length < 2 || !cols[0] || !cols[1]) {
      errors.push(`Linha ${lineNum}: formato inválido (esperado: ticker,tipo)`);
      continue;
    }

    const ticker = cols[0].toUpperCase();
    const typeRaw = cols[1].toUpperCase();

    if (ticker.length > 20) {
      errors.push(`Linha ${lineNum}: ticker "${cols[0]}" excede 20 caracteres`);
      continue;
    }

    if (!VALID_TYPES.includes(typeRaw as AssetType)) {
      errors.push(
        `Linha ${lineNum}: tipo "${cols[1]}" inválido (use: STOCK, ACAO, FII, RF)`
      );
      continue;
    }

    if (seen.has(ticker)) {
      rows.push({ ticker, type: typeRaw as AssetType, error: "Duplicado no CSV" });
    } else {
      seen.add(ticker);
      rows.push({ ticker, type: typeRaw as AssetType });
    }
  }

  return { rows, errors };
}

function parseExcelRows(rows: Row[]): { rows: ParsedRow[]; errors: string[] } {
  if (rows.length === 0) return { rows: [], errors: ["Arquivo vazio"] };

  // Detect header
  const firstRow = rows[0].map((c) => String(c ?? "").trim());
  const isHeader =
    firstRow.length >= 2 &&
    !VALID_TYPES.includes(firstRow[1].toUpperCase() as AssetType);
  const dataRows = isHeader ? rows.slice(1) : rows;

  if (dataRows.length === 0) return { rows: [], errors: ["Nenhuma linha de dados encontrada"] };
  if (dataRows.length > 200) return { rows: [], errors: ["Máximo de 200 linhas por importação"] };

  const parsed: ParsedRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < dataRows.length; i++) {
    const lineNum = isHeader ? i + 2 : i + 1;
    const cols = dataRows[i].map((c) => String(c ?? "").trim());

    if (cols.length < 2 || !cols[0] || !cols[1]) {
      errors.push(`Linha ${lineNum}: formato inválido (esperado: ticker, tipo)`);
      continue;
    }

    const ticker = cols[0].toUpperCase();
    const typeRaw = cols[1].toUpperCase();

    if (ticker.length > 20) {
      errors.push(`Linha ${lineNum}: ticker "${cols[0]}" excede 20 caracteres`);
      continue;
    }

    if (!VALID_TYPES.includes(typeRaw as AssetType)) {
      errors.push(`Linha ${lineNum}: tipo "${cols[1]}" inválido (use: STOCK, ACAO, FII, RF)`);
      continue;
    }

    if (seen.has(ticker)) {
      parsed.push({ ticker, type: typeRaw as AssetType, error: "Duplicado" });
    } else {
      seen.add(ticker);
      parsed.push({ ticker, type: typeRaw as AssetType });
    }
  }

  return { rows: parsed, errors };
}

export default function CsvImportModal({ onClose, onSaved }: CsvImportModalProps) {
  const [step, setStep] = useState<ModalStep>("upload");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [result, setResult] = useState<BulkAssetResponse | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = parsedRows.filter((r) => !r.error);

  const handleFile = useCallback((file: File) => {
    setError("");
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    if (isExcel) {
      readXlsxFile(file).then((excelRows) => {
        const { rows, errors } = parseExcelRows(excelRows);
        setParsedRows(rows);
        setParseErrors(errors);
        if (rows.length > 0) {
          setStep("preview");
        } else if (errors.length > 0) {
          setError(errors.join("\n"));
        }
      }).catch(() => {
        setError("Erro ao ler arquivo Excel");
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const { rows, errors } = parseCsv(text);
        setParsedRows(rows);
        setParseErrors(errors);
        if (rows.length > 0) {
          setStep("preview");
        } else if (errors.length > 0) {
          setError(errors.join("\n"));
        }
      };
      reader.readAsText(file);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleImport = async () => {
    setStep("loading");
    setError("");

    try {
      const data = await apiFetch<BulkAssetResponse>("/assets/bulk", {
        method: "POST",
        body: JSON.stringify({
          assets: validRows.map((r) => ({ ticker: r.ticker, type: r.type })),
        }),
      });
      setResult(data);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar");
      setStep("preview");
    }
  };

  const handleClose = () => {
    if (result && (result.created.length > 0 || result.linked.length > 0)) {
      onSaved();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Importar Ativos</h2>
          <button
            onClick={handleClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragging
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                  : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]"
              }`}
            >
              <Upload
                size={32}
                className="mx-auto mb-3 text-[var(--color-text-muted)]"
              />
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">
                Arraste um arquivo ou clique para selecionar
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                CSV ou Excel — Colunas: ticker, tipo (STOCK, ACAO, FII, RF)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>

            <a
              href="/modelo-importacao.xlsx"
              download
              className="flex items-center justify-center gap-2 text-sm text-[var(--color-accent)] hover:underline"
            >
              <Download size={14} />
              Baixar modelo Excel
            </a>

            {error && (
              <pre className="text-sm text-[var(--color-negative)] whitespace-pre-wrap">
                {error}
              </pre>
            )}
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && (
          <div className="flex flex-col gap-4 min-h-0">
            {parseErrors.length > 0 && (
              <div className="bg-[var(--color-negative)]/10 border border-[var(--color-negative)]/20 rounded-lg p-3">
                <p className="text-xs font-medium text-[var(--color-negative)] mb-1">
                  {parseErrors.length} erro(s) de formato:
                </p>
                {parseErrors.map((err, i) => (
                  <p key={i} className="text-xs text-[var(--color-negative)]">
                    {err}
                  </p>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">
                {validRows.length} ativo(s) para importar
                {parsedRows.length !== validRows.length && (
                  <span className="text-[var(--color-text-muted)]">
                    {" "}
                    ({parsedRows.length - validRows.length} duplicado(s))
                  </span>
                )}
              </span>
              <button
                onClick={() => {
                  setParsedRows([]);
                  setParseErrors([]);
                  setError("");
                  setStep("upload");
                }}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                Trocar arquivo
              </button>
            </div>

            <div className="overflow-y-auto max-h-64 rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-main)]">
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Ticker
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Tipo
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-[var(--color-border)]/50 ${
                        row.error ? "opacity-50" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5 font-medium">{row.ticker}</td>
                      <td className="px-3 py-1.5">
                        <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-bg-main)] text-[var(--color-text-secondary)]">
                          {CLASS_LABELS[row.type]}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {row.error ? (
                          <span className="text-[var(--color-negative)]">
                            {row.error}
                          </span>
                        ) : (
                          <span className="text-[var(--color-positive)]">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <p className="text-sm text-[var(--color-negative)]">{error}</p>
            )}

            <button
              onClick={handleImport}
              disabled={validRows.length === 0}
              className="w-full py-2 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Importar {validRows.length} ativo(s)
            </button>
          </div>
        )}

        {/* Step: Loading */}
        {step === "loading" && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              Importando...
            </p>
          </div>
        )}

        {/* Step: Result */}
        {step === "result" && result && (
          <div className="flex flex-col gap-4 min-h-0">
            {(result.created.length > 0 || result.linked.length > 0) && (
              <div>
                <p className="text-sm font-medium text-[var(--color-positive)] mb-3">
                  {result.created.length + result.linked.length} ativo(s) adicionado(s) ao seu catálogo
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-52 overflow-y-auto">
                  {[...result.created, ...result.linked].map((item) => (
                    <div
                      key={item.ticker}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-[var(--color-bg-main)]"
                    >
                      <TickerLogo
                        ticker={item.ticker}
                        type={item.type}
                        size={32}
                      />
                      <span className="text-xs font-medium text-[var(--color-text-primary)]">
                        {item.ticker}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {CLASS_LABELS[item.type]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.created.length === 0 && result.linked.length === 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-[var(--color-text-muted)]">
                  Nenhum ativo novo adicionado
                </p>
              </div>
            )}

            {result.skipped.length > 0 && (
              <div>
                <button
                  onClick={() => setShowSkipped(!showSkipped)}
                  className="flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                >
                  {showSkipped ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  {result.skipped.length} ignorado(s)
                </button>
                {showSkipped && (
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {result.skipped.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs px-2 py-1 rounded bg-[var(--color-bg-main)]"
                      >
                        <span className="font-medium text-[var(--color-text-secondary)]">
                          {item.ticker}
                        </span>
                        <span className="text-[var(--color-text-muted)]">
                          {item.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full py-2 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 transition-opacity"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
