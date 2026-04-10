"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PriceStatusResponse } from "@/types";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "agora";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

export default function PriceUpdateStatus() {
  const [status, setStatus] = useState<PriceStatusResponse | null>(null);
  const [countdown, setCountdown] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiFetch<PriceStatusResponse>("/prices/status");
      setStatus(data);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Tick countdown every 60s
  useEffect(() => {
    if (!status) return;

    const update = () => {
      const nextRun = new Date(status.next_run_utc).getTime();
      const now = Date.now();
      setCountdown(formatCountdown(nextRun - now));
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [status]);

  const lastUpdateFormatted = status?.last_run_utc
    ? new Date(status.last_run_utc).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
      <Clock size={14} />
      {lastUpdateFormatted && (
        <span>Última: {lastUpdateFormatted}</span>
      )}
      <span>
        · Próxima em <span className="font-semibold text-[var(--color-text-secondary)]">{countdown || "..."}</span>
      </span>
    </div>
  );
}
