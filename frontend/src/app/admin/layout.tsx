"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Shield, Users, Key, Database, Download } from "lucide-react";

function HoneypotPage({ onTrigger }: { onTrigger: () => void }) {
  const [userCount] = useState(() => Math.floor(Math.random() * 40) + 120);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Shield size={28} className="text-emerald-400" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Painel Administrativo
            </h1>
            <p className="text-sm text-zinc-500">
              Sistema de Gerenciamento de Investimentos v2.4.1
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <Users size={16} />
              <span>Usuarios Ativos</span>
            </div>
            <p className="text-2xl font-bold">{userCount}</p>
          </div>
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <Database size={16} />
              <span>Registros</span>
            </div>
            <p className="text-2xl font-bold">14,832</p>
          </div>
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
              <Key size={16} />
              <span>Sessoes Ativas</span>
            </div>
            <p className="text-2xl font-bold">37</p>
          </div>
        </div>

        {/* Fake table */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Usuarios & Credenciais</h2>
            <span className="text-xs text-zinc-600 bg-zinc-800 px-3 py-1 rounded-full">
              CONFIDENCIAL
            </span>
          </div>

          {/* Fake table header */}
          <div className="grid grid-cols-4 gap-4 text-xs text-zinc-500 uppercase tracking-wider pb-3 border-b border-zinc-800 mb-3">
            <span>Usuario</span>
            <span>Email</span>
            <span>Senha (hash)</span>
            <span>Saldo Total</span>
          </div>

          {/* Blurred rows */}
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="grid grid-cols-4 gap-4 py-3 border-b border-zinc-800/50 text-sm"
            >
              <span className="text-zinc-300 blur-[6px] select-none">
                usuario_{i * 13}
              </span>
              <span className="text-zinc-400 blur-[6px] select-none">
                user{i}@email.com
              </span>
              <span className="text-zinc-500 blur-[6px] select-none font-mono">
                $2b$12$kX9...{i}f4
              </span>
              <span className="text-emerald-400 blur-[6px] select-none">
                R$ {(i * 47832).toLocaleString("pt-BR")}
              </span>
            </div>
          ))}

          <div className="mt-6 flex items-center justify-center gap-3">
            <p className="text-zinc-500 text-sm">
              Dados protegidos. Clique para revelar.
            </p>
          </div>

          {/* THE BUTTON */}
          <button
            onClick={onTrigger}
            className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-900/30 active:scale-[0.98]"
          >
            <Download size={18} />
            Exportar Usuarios & Senhas (.csv)
          </button>
        </div>
      </div>
    </div>
  );
}

function JumpscarePhase({ onDone }: { onDone: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 1;
      audioRef.current.play().catch(() => {});
    }
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        backgroundColor: "black",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "none",
      }}
    >
      <audio
        ref={audioRef}
        src="/jeremayjimenez-smile-dog-jumpscare-167171.mp3"
        preload="auto"
      />
      <img
        src="/jumpscare.jpeg"
        alt=""
        style={{
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
          animation: "jumpscareShake 0.1s infinite",
        }}
      />
      <style>{`
        @keyframes jumpscareShake {
          0% { transform: translate(0, 0) scale(1.05); }
          25% { transform: translate(-5px, 5px) scale(1.08); }
          50% { transform: translate(5px, -5px) scale(1.05); }
          75% { transform: translate(-3px, -3px) scale(1.1); }
          100% { transform: translate(3px, 3px) scale(1.05); }
        }
      `}</style>
    </div>
  );
}

function TrolledMessage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl">
          {"<"}3
        </div>
        <h1 className="text-3xl font-extrabold text-white">
          Voce foi trollado, hacker
        </h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Achou que ia ser facil assim? Nao tem nenhum dado aqui pra voce.
          Aquela tabela era mais falsa que nota de 3 reais.
        </p>
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 text-left">
          <p className="text-sm text-zinc-500 font-mono">
            <span className="text-red-400">access_log:</span> IP registrado
            <br />
            <span className="text-red-400">status:</span> unauthorized_access_attempt
            <br />
            <span className="text-red-400">action:</span> jumpscare_deployed
            <br />
            <span className="text-yellow-400">message:</span> &quot;boa sorte na proxima vida&quot;
          </p>
        </div>
        <button
          onClick={() => router.replace("/login")}
          className="px-6 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition-colors"
        >
          Sair com o rabo entre as pernas
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, isAuthenticated, isAdmin } = useAuth();
  const [phase, setPhase] = useState<"loading" | "honeypot" | "scare" | "trolled" | "legit">("loading");

  const handleScareEnd = useCallback(() => setPhase("trolled"), []);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && isAdmin) {
      setPhase("legit");
    } else {
      setPhase("honeypot");
    }
  }, [isLoading, isAuthenticated, isAdmin]);

  if (phase === "loading") return null;
  if (phase === "honeypot") return <HoneypotPage onTrigger={() => setPhase("scare")} />;
  if (phase === "scare") return <JumpscarePhase onDone={handleScareEnd} />;
  if (phase === "trolled") return <TrolledMessage />;

  return <>{children}</>;
}
