"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { navItems } from "./sidebar";
import type { NavChild } from "./sidebar";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const { logout, isAdmin } = useAuth();
  const [ativosExpanded, setAtivosExpanded] = useState(true);

  const hasActiveChild = (children: NavChild[]) =>
    children.some((child) =>
      child.exact ? pathname === child.href : pathname.startsWith(child.href)
    );

  // Close on navigation
  useEffect(() => {
    onClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[var(--color-bg-sidebar)] border-r border-[var(--color-border)] flex flex-col transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="border-b border-[var(--color-border)] py-4 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="CofrinhoGordinho" className="w-10 h-10" />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Cofrinho Gordinho
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
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
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full ${
                      isChildActive
                        ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    <Icon
                      size={18}
                      className={isChildActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}
                    />
                    <span className="truncate flex-1 text-left">{item.label}</span>
                    <ChevronRight
                      size={14}
                      className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>

                  {isExpanded && (
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
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
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
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-border)] space-y-1.5">
          {isAdmin && (
            <Link
              href="/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full ${
                pathname.startsWith("/admin")
                  ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] shadow-sm"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              <ShieldCheck
                size={18}
                className={pathname.startsWith("/admin") ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}
              />
              <span>Admin</span>
            </Link>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-all duration-200 w-full"
          >
            <LogOut size={18} className="text-[var(--color-text-muted)]" />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
}
