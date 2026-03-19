"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Building2,
  Landmark,
  PiggyBank,
  History,
  Target,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const navItems = [
  {
    label: "Painel",
    href: "/carteira",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Stocks (EUA)",
    href: "/carteira/stocks",
    icon: TrendingUp,
  },
  {
    label: "Acoes (Brasil)",
    href: "/carteira/acoes",
    icon: Building2,
  },
  {
    label: "FIIs",
    href: "/carteira/fiis",
    icon: Landmark,
  },
  {
    label: "Renda Fixa",
    href: "/carteira/renda-fixa",
    icon: PiggyBank,
  },
  {
    label: "Aportes",
    href: "/carteira/aportes",
    icon: History,
  },
  {
    label: "Ativos Desejados",
    href: "/desejados",
    icon: Target,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <aside className="w-64 min-h-screen bg-[var(--color-bg-sidebar)] border-r border-[var(--color-border)] flex flex-col">
      <div className="p-6 border-b border-[var(--color-border)] flex flex-col gap-1">
        <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          Carteira
        </h1>
        <p className="text-sm font-medium text-[var(--color-text-muted)]">
          Investimentos
        </p>
      </div>

      <nav className="flex-1 p-4 space-y-1.5">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] shadow-sm"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              <Icon 
                size={18} 
                className={isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"} 
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[var(--color-border)]">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-all duration-200 w-full"
        >
          <LogOut size={18} className="text-[var(--color-text-muted)]" />
          Sair
        </button>
      </div>
    </aside>
  );
}
