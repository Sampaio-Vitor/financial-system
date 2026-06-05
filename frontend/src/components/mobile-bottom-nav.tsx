"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Calculator,
  Coins,
  LayoutDashboard,
} from "lucide-react";

const bottomNavItems = [
  {
    label: "Geral",
    href: "/carteira",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Ativos",
    href: "/carteira/catalogo",
    icon: Briefcase,
    match: ["/carteira/catalogo", "/carteira/stocks", "/carteira/acoes", "/carteira/etfs", "/carteira/fiis", "/carteira/cripto", "/carteira/renda-fixa", "/carteira/reserva"],
  },
  {
    label: "Proventos",
    href: "/carteira/proventos",
    icon: Coins,
  },
  {
    label: "Aporte",
    ariaLabel: "Planejador de Aporte",
    href: "/desejados",
    icon: Calculator,
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-bg-main)]/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-1.5 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : item.match
              ? item.match.some((match) => pathname.startsWith(match))
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.ariaLabel ?? item.label}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                  : "text-[var(--color-text-muted)] active:bg-[var(--color-bg-card)]"
              }`}
            >
              <Icon size={19} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
