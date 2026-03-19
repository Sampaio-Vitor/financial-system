"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrentMonth } from "@/lib/format";

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

interface MonthPickerProps {
  month: string;
  onChange: (month: string) => void;
  minMonth?: string | null;
  onClose: () => void;
}

export default function MonthPicker({ month, onChange, minMonth, onClose }: MonthPickerProps) {
  const [viewYear, setViewYear] = useState(() => parseInt(month.split("-")[0]));
  const ref = useRef<HTMLDivElement>(null);
  const currentMonth = getCurrentMonth();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const minYear = minMonth ? parseInt(minMonth.split("-")[0]) : null;
  const minM = minMonth ? parseInt(minMonth.split("-")[1]) : null;
  const currentYear = parseInt(currentMonth.split("-")[0]);
  const currentM = parseInt(currentMonth.split("-")[1]);

  const canPrevYear = minYear === null || viewYear > minYear;
  const canNextYear = viewYear < currentYear;

  const isDisabled = (m: number) => {
    const key = `${viewYear}-${String(m).padStart(2, "0")}`;
    if (minMonth && key < minMonth) return true;
    if (key > currentMonth) return true;
    return false;
  };

  const isSelected = (m: number) => {
    return month === `${viewYear}-${String(m).padStart(2, "0")}`;
  };

  const handleSelect = (m: number) => {
    if (isDisabled(m)) return;
    onChange(`${viewYear}-${String(m).padStart(2, "0")}`);
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute top-full mt-2 z-50 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-lg p-4 w-64"
    >
      {/* Year navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => canPrevYear && setViewYear((y) => y - 1)}
          disabled={!canPrevYear}
          className="p-1 rounded-md hover:bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">{viewYear}</span>
        <button
          onClick={() => canNextYear && setViewYear((y) => y + 1)}
          disabled={!canNextYear}
          className="p-1 rounded-md hover:bg-[var(--color-bg-main)] text-[var(--color-text-secondary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Month grid 4x3 */}
      <div className="grid grid-cols-4 gap-1.5">
        {MONTH_NAMES.map((name, i) => {
          const m = i + 1;
          const disabled = isDisabled(m);
          const selected = isSelected(m);

          return (
            <button
              key={name}
              onClick={() => handleSelect(m)}
              disabled={disabled}
              className={`py-2 text-xs font-medium rounded-lg transition-all ${
                selected
                  ? "bg-[var(--color-accent)] text-white"
                  : disabled
                    ? "text-[var(--color-text-muted)]/40 cursor-not-allowed"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-main)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
