"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type {
  Notification,
  NotificationListResponse,
  NotificationUnreadCountResponse,
} from "@/types";

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const loadUnreadCount = useCallback(async () => {
    const data = await apiFetch<NotificationUnreadCountResponse>(
      "/notifications/unread-count",
    );
    setUnreadCount(data.unread_count);
  }, []);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<NotificationListResponse>("/notifications?limit=20");
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUnreadCount();
    const intervalId = window.setInterval(() => {
      void loadUnreadCount();
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [loadUnreadCount]);

  useEffect(() => {
    if (!isOpen) return;
    void loadNotifications();
  }, [isOpen, loadNotifications]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const markAllRead = async () => {
    await apiFetch("/notifications/mark-all-read", { method: "POST" });
    setUnreadCount(0);
    setNotifications((items) =>
      items.map((item) => ({
        ...item,
        read_at: item.read_at ?? new Date().toISOString(),
      })),
    );
  };

  const openNotification = async (notification: Notification) => {
    if (!notification.read_at) {
      await apiFetch<Notification>(`/notifications/${notification.id}/read`, {
        method: "PATCH",
      });
      setUnreadCount((count) => Math.max(0, count - 1));
      setNotifications((items) =>
        items.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
    }
    setIsOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notificações"
        onClick={() => setIsOpen((value) => !value)}
        className={`relative p-2 rounded-xl transition-colors ${
          unreadCount > 0
            ? "text-[var(--color-negative)] hover:bg-[var(--color-negative)]/10"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
        }`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-[var(--color-negative)] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--color-bg-main)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-sidebar)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Notificações
            </span>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] disabled:opacity-40 disabled:hover:bg-transparent"
              aria-label="Marcar todas como lidas"
              title="Marcar todas como lidas"
            >
              <CheckCheck size={17} />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--color-text-secondary)]">
                Carregando...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--color-text-secondary)]">
                Nenhuma notificação
              </div>
            ) : (
              notifications.map((notification) => {
                const isUnread = !notification.read_at;
                return (
                  <button
                    type="button"
                    key={notification.id}
                    onClick={() => void openNotification(notification)}
                    className={`w-full border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--color-bg-card)] ${
                      isUnread ? "bg-[var(--color-negative)]/5" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {isUnread && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-negative)]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                            {notification.title}
                          </p>
                          <time className="shrink-0 text-[11px] text-[var(--color-text-muted)]">
                            {formatNotificationTime(notification.created_at)}
                          </time>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">
                          {notification.message}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
