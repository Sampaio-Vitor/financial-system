"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getMonthLabel, getPrevMonth, getNextMonth, getCurrentMonth } from "@/lib/format";
import MonthPicker from "@/components/month-picker";

interface MonthNavigatorProps {
  month: string;
  onChange: (month: string) => void;
  minMonth?: string | null;
}

export default function MonthNavigator({ month, onChange, minMonth }: MonthNavigatorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const currentMonth = getCurrentMonth();
  const isCurrentMonth = month === currentMonth;
  const isAtMin = !!minMonth && month <= minMonth;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(getPrevMonth(month))}
        disabled={isAtMin}
        className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft size={18} />
      </button>

      <div className="relative">
        <button
          onClick={() => setPickerOpen((prev) => !prev)}
          className="text-sm font-medium px-4 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] min-w-[180px] text-center hover:border-[var(--color-text-muted)]/50 transition-colors cursor-pointer"
        >
          {getMonthLabel(month)}
        </button>
        {pickerOpen && (
          <MonthPicker
            month={month}
            onChange={onChange}
            minMonth={minMonth}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      <button
        onClick={() => onChange(getNextMonth(month))}
        disabled={isCurrentMonth}
        className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
