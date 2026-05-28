"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface MobileCardItem {
  label: string;
  value: ReactNode;
}

interface MobileCardProps {
  header: ReactNode;
  badge?: ReactNode;
  bodyItems: MobileCardItem[];
  expandedItems?: MobileCardItem[];
  actions?: ReactNode;
}

export default function MobileCard({
  header,
  badge,
  bodyItems,
  expandedItems,
  actions,
}: MobileCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3.5 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">{header}</div>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          {actions}
          {expandedItems && expandedItems.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Ocultar detalhes" : "Mostrar detalhes"}
              className="flex size-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors active:bg-[var(--color-bg-main)]"
            >
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Body items */}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {bodyItems.map((item) => (
          <div key={item.label} className="min-w-0">
            <span className="block text-[11px] leading-4 text-[var(--color-text-muted)]">{item.label}</span>
            <div className="truncate text-sm font-medium text-[var(--color-text-secondary)]">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Expanded details */}
      {expanded && expandedItems && expandedItems.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--color-border)] pt-3">
          {expandedItems.map((item) => (
            <div key={item.label} className="min-w-0">
              <span className="block text-[11px] leading-4 text-[var(--color-text-muted)]">{item.label}</span>
              <div className="truncate text-sm text-[var(--color-text-secondary)]">{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
