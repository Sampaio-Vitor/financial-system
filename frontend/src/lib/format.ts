export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  const num = Number(value);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}

export function formatUSD(value: number | null | undefined): string {
  if (value == null) return "—";
  const num = Number(value);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  const num = Number(value);
  if (isNaN(num)) return "—";
  const sign = num >= 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

export function formatQuantity(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(Number(value));
}

export function formatEditableNumber(
  value: number | null | undefined,
  maxFractionDigits = 8
): string {
  if (value == null) return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num.toFixed(maxFractionDigits).replace(/\.?0+$/, "");
}

export function getMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${months[parseInt(m) - 1]} de ${year}`;
}

export function getPrevMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (m === 1) return `${year - 1}-12`;
  return `${year}-${String(m - 1).padStart(2, "0")}`;
}

export function getNextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (m === 12) return `${year + 1}-01`;
  return `${year}-${String(m + 1).padStart(2, "0")}`;
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
