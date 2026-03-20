"use client";

export default function CarteiraError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-8 max-w-md text-center">
        <h2 className="text-xl font-bold mb-2">Erro na Carteira</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          {error.message || "Ocorreu um erro ao carregar esta secao."}
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
