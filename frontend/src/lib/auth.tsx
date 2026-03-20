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
  isAuthenticated: boolean;
  userId: number | null;
  isAdmin: boolean;
  login: (username: string, password: string, turnstileToken?: string) => Promise<void>;
  register: (username: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
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

function getUserIdFromToken(): number | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return parseInt(payload.sub, 10) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    setIsAuthenticated(!!token);
    setUserId(getUserIdFromToken());
  }, []);

  const login = useCallback(async (username: string, password: string, turnstileToken?: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, turnstile_token: turnstileToken || "" }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Falha no login" }));
      throw new Error(extractErrorMessage(err, "Falha no login"));
    }

    const data = await res.json();
    localStorage.setItem("token", data.access_token);
    setIsAuthenticated(true);
    setUserId(getUserIdFromToken());
  }, []);

  const register = useCallback(async (username: string, password: string, turnstileToken?: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, turnstile_token: turnstileToken || "" }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Falha no registro" }));
      throw new Error(extractErrorMessage(err, "Falha no registro"));
    }

    const data = await res.json();
    localStorage.setItem("token", data.access_token);
    setIsAuthenticated(true);
    setUserId(getUserIdFromToken());
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setIsAuthenticated(false);
    setUserId(null);
    window.location.href = "/login";
  }, []);

  const isAdmin = userId === 1;

  return (
    <AuthContext.Provider value={{ isAuthenticated, userId, isAdmin, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
