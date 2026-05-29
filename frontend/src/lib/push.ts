import { apiFetch } from "@/lib/api";

interface PushPublicKeyResponse {
  enabled: boolean;
  public_key: string | null;
}

export interface PushStatus {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  reason?: string;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) {
    return {
      supported: false,
      configured: false,
      permission: "unsupported",
      subscribed: false,
      reason: "Este navegador não suporta notificações push.",
    };
  }

  const key = await apiFetch<PushPublicKeyResponse>("/notifications/push/public-key");
  const reg = await registration();
  const subscription = await reg.pushManager.getSubscription();

  return {
    supported: true,
    configured: key.enabled,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
    reason: key.enabled ? undefined : "Notificações push não estão configuradas no servidor.",
  };
}

export async function subscribePushNotifications() {
  if (!pushSupported()) {
    throw new Error("Este navegador não suporta notificações push.");
  }

  const key = await apiFetch<PushPublicKeyResponse>("/notifications/push/public-key");
  if (!key.enabled || !key.public_key) {
    throw new Error("Notificações push não estão configuradas no servidor.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissão de notificação não concedida.");
  }

  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key.public_key),
    }));

  await apiFetch("/notifications/push/subscribe", {
    method: "POST",
    body: JSON.stringify(subscription.toJSON()),
  });

  return subscription;
}

export async function unsubscribePushNotifications() {
  if (!pushSupported()) return;
  const reg = await registration();
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;

  await apiFetch("/notifications/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify(subscription.toJSON()),
  });
  await subscription.unsubscribe();
}
