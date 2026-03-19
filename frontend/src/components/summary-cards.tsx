import { formatBRL, formatPercent } from "@/lib/format";

interface CardData {
  label: string;
  value: number;
  format: "brl" | "percent";
  colorBySign?: boolean;
}

interface SummaryCardsProps {
  cards: CardData[];
}

export default function SummaryCards({ cards }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => {
        const formatted =
          card.format === "brl" ? formatBRL(card.value) : formatPercent(card.value);
        const colorClass = card.colorBySign
          ? card.value > 0
            ? "text-[var(--color-positive)]"
            : card.value < 0 
            ? "text-[var(--color-negative)]"
            : "text-[var(--color-text-primary)]"
          : "text-[var(--color-text-primary)]";

        return (
          <div
            key={card.label}
            className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm flex flex-col justify-between hover:border-[var(--color-border)]/80 transition-colors"
          >
            <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              {card.label}
            </p>
            <p className={`text-2xl font-bold tracking-tight ${colorClass}`}>{formatted}</p>
          </div>
        );
      })}
    </div>
  );
}
