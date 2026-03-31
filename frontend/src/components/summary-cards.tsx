import { formatBRL, formatPercent } from "@/lib/format";
import { ChevronDown } from "lucide-react";

interface CardData {
  label: string;
  value: number;
  format: "brl" | "percent";
  colorBySign?: boolean;
  expandable?: boolean;
}

interface SummaryCardsProps {
  cards: CardData[];
  expandedCard: string | null;
  onToggleCard: (label: string) => void;
}

export default function SummaryCards({ cards, expandedCard, onToggleCard }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 items-start">
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

        const isExpanded = expandedCard === card.label;
        const isExpandable = card.expandable;

        return (
          <div
            key={card.label}
            onClick={isExpandable ? () => onToggleCard(card.label) : undefined}
            className={`border flex flex-col justify-between transition-all duration-200 ${
              isExpanded
                ? "bg-[var(--color-bg-card)] rounded-t-2xl rounded-b-none border-[var(--color-border)] border-b-transparent shadow-none z-10 relative px-4 pt-4 pb-6"
                : "bg-[var(--color-bg-card)] rounded-2xl border-[var(--color-border)] shadow-sm hover:border-[var(--color-text-muted)]/30 p-3 md:p-4"
            } ${isExpandable ? "cursor-pointer group" : ""}`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className={`text-xs font-medium transition-colors duration-200 ${
                isExpanded
                  ? "text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-secondary)]"
              }`}>
                {card.label}
              </p>
              {isExpandable && (
                <ChevronDown
                  size={16}
                  className={`transition-all duration-300 ${
                    isExpanded
                      ? "rotate-180 text-[var(--color-accent)]"
                      : "text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]"
                  }`}
                />
              )}
            </div>
            <p className={`text-lg font-bold tracking-tight ${colorClass}`}>{formatted}</p>
          </div>
        );
      })}
    </div>
  );
}
