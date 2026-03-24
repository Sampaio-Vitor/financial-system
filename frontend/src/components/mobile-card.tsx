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
    <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">{header}</div>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          {actions}
          {expandedItems && expandedItems.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg hover:bg-[var(--color-bg-main)] text-[var(--color-text-muted)] transition-colors"
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
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        {bodyItems.map((item) => (
          <div key={item.label}>
            <span className="text-xs text-[var(--color-text-muted)]">{item.label}</span>
            <div className="text-sm text-[var(--color-text-secondary)]">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Expanded details */}
      {expanded && expandedItems && expandedItems.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] grid grid-cols-2 gap-x-4 gap-y-1">
          {expandedItems.map((item) => (
            <div key={item.label}>
              <span className="text-xs text-[var(--color-text-muted)]">{item.label}</span>
              <div className="text-sm text-[var(--color-text-secondary)]">{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
