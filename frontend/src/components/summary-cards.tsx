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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const formatted =
          card.format === "brl" ? formatBRL(card.value) : formatPercent(card.value);
        const colorClass = card.colorBySign
          ? card.value >= 0
            ? "text-[var(--color-positive)]"
            : "text-[var(--color-negative)]"
          : "text-[var(--color-text-primary)]";

        return (
          <div
            key={card.label}
            className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-5"
          >
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              {card.label}
            </p>
            <p className={`text-xl font-bold ${colorClass}`}>{formatted}</p>
          </div>
        );
      })}
    </div>
  );
}
