"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const { login, register, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  const resetTurnstile = useCallback(() => {
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      setTurnstileToken("");
    }
  }, []);

  const renderTurnstile = useCallback(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileRef.current || !window.turnstile) return;
    if (widgetIdRef.current !== null) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }
    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => setTurnstileToken(token),
      theme: "dark",
    });
  }, []);

  useEffect(() => {
    if (window.turnstile) {
      renderTurnstile();
    }
  }, [renderTurnstile]);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace("/carteira");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        await login(username, password, turnstileToken);
      } else {
        await register(username, password, turnstileToken);
      }
      router.push("/carteira");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou");
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setError("");
    setMode(mode === "login" ? "register" : "login");
  };

  const isLogin = mode === "login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-main)] p-4">
      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onReady={renderTurnstile}
        />
      )}

      <div className="w-full max-w-md bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-8 shadow-lg">
        <div className="mb-8 text-center">
          <img src="/logo.svg" alt="CofrinhoGordinho" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)] mb-1">
            CofrinhoGordinho
          </h1>
          <p className="text-[var(--color-text-muted)] text-sm font-medium">
{isLogin ? "Seu porquinho de investimentos" : "Crie sua conta para começar"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
              Usuário
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 focus:border-[var(--color-accent)] transition-all"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 focus:border-[var(--color-accent)] transition-all"
              required
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-[var(--color-negative)]/10 border border-[var(--color-negative)]/20">
              <p className="text-[var(--color-negative)] text-sm font-medium text-center">{error}</p>
            </div>
          )}

          {TURNSTILE_SITE_KEY && (
            <div ref={turnstileRef} className="flex justify-center" />
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[var(--color-accent)] text-white font-semibold hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition-colors mt-2 shadow-sm"
          >
            {loading
              ? (isLogin ? "Entrando..." : "Criando conta...")
              : (isLogin ? "Entrar" : "Criar conta")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
          {isLogin ? "Não tem conta? " : "Já tem conta? "}
          <button
            type="button"
            onClick={toggleMode}
            className="text-[var(--color-accent)] font-medium hover:underline"
          >
            {isLogin ? "Criar conta" : "Entrar"}
          </button>
        </p>
      </div>
    </div>
  );
}
