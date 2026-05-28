"use client";

import { Menu } from "lucide-react";
import NotificationBell from "@/components/notification-bell";

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export default function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-main)]/95 px-3 backdrop-blur md:hidden">
      <button
        onClick={onMenuClick}
        aria-label="Abrir menu"
        className="-ml-1 flex size-10 items-center justify-center rounded-xl text-[var(--color-text-secondary)] transition-colors active:bg-[var(--color-bg-card)]"
      >
        <Menu size={22} />
      </button>
      <NotificationBell />
    </header>
  );
}
