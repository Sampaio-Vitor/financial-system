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
  Menu,
  ChevronLeft,
  ShieldCheck,
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
    label: "Ações (Brasil)",
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
    label: "Reserva",
    href: "/carteira/reserva",
    icon: ShieldCheck,
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

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <aside 
      className={`min-h-screen bg-[var(--color-bg-sidebar)] border-r border-[var(--color-border)] flex flex-col transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      <div className={`p-6 border-b border-[var(--color-border)] flex items-center ${isCollapsed ? "px-4 justify-center" : "px-6 justify-between"}`}>
        {!isCollapsed && (
          <div className="flex flex-col gap-1 overflow-hidden">
            <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)] whitespace-nowrap">
              Carteira
            </h1>
            <p className="text-sm font-medium text-[var(--color-text-muted)] whitespace-nowrap">
              Investimentos
            </p>
          </div>
        )}
        <button 
          onClick={onToggle}
          className="p-2 rounded-xl hover:bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] transition-colors"
        >
          <Menu size={20} />
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-1.5 overflow-hidden">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : ""}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] shadow-sm"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
              } ${isCollapsed ? "justify-center px-2" : ""}`}
            >
              <Icon 
                size={18} 
                className={isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"} 
              />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[var(--color-border)]">
        <button
          onClick={logout}
          title={isCollapsed ? "Sair" : ""}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-all duration-200 w-full ${isCollapsed ? "justify-center px-2" : ""}`}
        >
          <LogOut size={18} className="text-[var(--color-text-muted)]" />
          {!isCollapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}
