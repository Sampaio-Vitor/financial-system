"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  userId: number | null;
  isAdmin: boolean;
  login: (username: string, password: string, turnstileToken?: string) => Promise<void>;
  register: (username: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => void;
}

interface SessionResponse {
  user_id: number;
  username: string;
  is_admin: boolean;
}

interface TokenResponse {
  user: SessionResponse;
}

const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isAuthenticated: false,
  userId: null,
  isAdmin: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

function extractErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const detail = data.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const msg = detail[0].msg as string;
    return msg?.replace(/^Value error, /, "") || fallback;
  }
  return fallback;
}

function buildAuthState(session: SessionResponse | null) {
  return {
    isAuthenticated: !!session,
    userId: session?.user_id ?? null,
    isAdmin: session?.is_admin ?? false,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const applySession = useCallback((session: SessionResponse | null) => {
    const next = buildAuthState(session);
    setIsAuthenticated(next.isAuthenticated);
    setUserId(next.userId);
    setIsAdmin(next.isAdmin);
  }, []);

  useEffect(() => {
    const syncSession = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Session invalid");
        }
        const session = (await res.json()) as SessionResponse;
        applySession(session);
      } catch {
        applySession(null);
      } finally {
        setIsLoading(false);
      }
    };

    syncSession();
  }, [applySession]);

  const login = useCallback(async (username: string, password: string, turnstileToken?: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password, turnstile_token: turnstileToken || "" }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Falha no login" }));
      throw new Error(extractErrorMessage(err, "Falha no login"));
    }

    const data = (await res.json()) as TokenResponse;
    applySession(data.user);
  }, [applySession]);

  const register = useCallback(async (username: string, password: string, turnstileToken?: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password, turnstile_token: turnstileToken || "" }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Falha no registro" }));
      throw new Error(extractErrorMessage(err, "Falha no registro"));
    }

    const data = (await res.json()) as TokenResponse;
    applySession(data.user);
  }, [applySession]);

  const logout = useCallback(() => {
    const runLogout = async () => {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      } finally {
        applySession(null);
        window.location.href = "/login";
      }
    };

    void runLogout();
  }, [applySession]);

  return (
    <AuthContext.Provider value={{ isLoading, isAuthenticated, userId, isAdmin, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
