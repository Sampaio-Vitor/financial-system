"use client";

import { Menu } from "lucide-react";

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export default function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-14 bg-[var(--color-bg-main)] border-b border-[var(--color-border)] flex items-center px-4 md:hidden">
      <button
        onClick={onMenuClick}
        className="p-2 -ml-2 rounded-xl hover:bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] transition-colors"
      >
        <Menu size={22} />
      </button>
      <div className="ml-2 flex items-center gap-2">
        <img src="/logo.svg" alt="CofrinhoGordinho" className="w-7 h-7" />
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          Cofrinho Gordinho
        </span>
      </div>
    </header>
  );
}
