const API_BASE = "/api";

let refreshPromise: Promise<boolean> | null = null;

export async function refreshAuthSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    return res.ok;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function apiFetchInternal<T = void>(
  path: string,
  options: RequestInit = {},
  canRefresh = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: options.credentials ?? "include",
  });

  if (res.status === 401) {
    if (
      canRefresh &&
      !path.startsWith("/auth/login") &&
      !path.startsWith("/auth/register") &&
      !path.startsWith("/auth/refresh")
    ) {
      const refreshed = await refreshAuthSession();
      if (refreshed) {
        return apiFetchInternal<T>(path, options, false);
      }
    }
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  // 204 No Content: safe cast since T defaults to void for DELETE calls
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}


export async function apiFetch<T = void>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  return apiFetchInternal<T>(path, options, true);
}
