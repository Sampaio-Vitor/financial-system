"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  TrendingUp,
  Building2,
  Landmark,
  PiggyBank,
  DollarSign,
  Target,
  LogOut,
  Menu,
  ChevronRight,
  ShieldCheck,
  Briefcase,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";

type NavChild = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
};

type NavItem =
  | { label: string; icon: LucideIcon; href: string; exact?: boolean; children?: never }
  | { label: string; icon: LucideIcon; href?: never; exact?: never; children: NavChild[] };

const navItems: NavItem[] = [
  {
    label: "Visão Geral",
    href: "/carteira",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Mensal",
    href: "/carteira/mensal",
    icon: Calendar,
    exact: true,
  },
  {
    label: "Ativos",
    icon: Briefcase,
    children: [
      { label: "Stocks (EUA)", href: "/carteira/stocks", icon: TrendingUp },
      { label: "Ações (Brasil)", href: "/carteira/acoes", icon: Building2 },
      { label: "FIIs", href: "/carteira/fiis", icon: Landmark },
      { label: "Renda Fixa", href: "/carteira/renda-fixa", icon: PiggyBank },
      { label: "Reserva", href: "/carteira/reserva", icon: ShieldCheck },
    ],
  },
  {
    label: "Aportes em RV",
    href: "/carteira/aportes",
    icon: DollarSign,
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

  const hasActiveChild = (children: NavChild[]) =>
    children.some((child) =>
      child.exact ? pathname === child.href : pathname.startsWith(child.href)
    );

  const [ativosExpanded, setAtivosExpanded] = useState(true);

  return (
    <aside
      className={`h-screen sticky top-0 bg-[var(--color-bg-sidebar)] border-r border-[var(--color-border)] flex flex-col transition-all duration-300 ease-in-out ${
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

      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          if (item.children) {
            const isChildActive = hasActiveChild(item.children);
            const isExpanded = ativosExpanded || isChildActive;
            const Icon = item.icon;

            return (
              <div key={item.label}>
                <button
                  onClick={() => setAtivosExpanded(!ativosExpanded)}
                  title={isCollapsed ? item.label : ""}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full ${
                    isChildActive
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
                  } ${isCollapsed ? "justify-center px-2" : ""}`}
                >
                  <Icon
                    size={18}
                    className={isChildActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}
                  />
                  {!isCollapsed && (
                    <>
                      <span className="truncate flex-1 text-left">{item.label}</span>
                      <ChevronRight
                        size={14}
                        className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </>
                  )}
                </button>

                {!isCollapsed && isExpanded && (
                  <div className="mt-1 ml-3 space-y-0.5 border-l border-[var(--color-border)] pl-3">
                    {item.children.map((child) => {
                      const isActive = child.exact
                        ? pathname === child.href
                        : pathname.startsWith(child.href);
                      const ChildIcon = child.icon;

                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                            isActive
                              ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] shadow-sm"
                              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
                          }`}
                        >
                          <ChildIcon
                            size={16}
                            className={isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}
                          />
                          <span className="truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

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
