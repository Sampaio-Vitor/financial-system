"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function PushNotificationClickHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const notificationId = searchParams.get("push_notification_id");

  useEffect(() => {
    if (!notificationId) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("push_notification_id");
    const nextUrl = params.toString() ? `${pathname}?${params}` : pathname;

    void apiFetch(`/notifications/${notificationId}/read`, {
      method: "PATCH",
    }).finally(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }, [notificationId, pathname, router, searchParams]);

  return null;
}
