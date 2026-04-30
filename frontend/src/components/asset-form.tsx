"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Asset, AssetClass, CurrencyCode, Market, TesouroKind } from "@/types";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface AssetFormProps {
  onClose: () => void;
  onSaved: () => void;
}

function allowedCurrenciesFor(assetClass: AssetClass, market: Market): CurrencyCode[] {
  if (assetClass === "RF" || assetClass === "FII") return ["BRL"];
  if (assetClass === "STOCK") return market === "BR" ? ["BRL"] : ["USD"];
  if (assetClass === "ETF") {
    if (market === "BR") return ["BRL"];
    if (market === "US") return ["USD"];
    return ["USD", "EUR", "GBP"];
  }
  return ["BRL"];
}

function defaultCurrencyFor(assetClass: AssetClass, market: Market): CurrencyCode {
  return allowedCurrenciesFor(assetClass, market)[0];
}

export default function AssetForm({ onClose, onSaved }: AssetFormProps) {
  const { isAdmin } = useAuth();
  const [ticker, setTicker] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("STOCK");
  const [market, setMarket] = useState<Market>("BR");
  const [quoteCurrency, setQuoteCurrency] = useState<CurrencyCode>("BRL");
  const [priceSymbol, setPriceSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [tdKind, setTdKind] = useState<TesouroKind>("SELIC");
  const [tdMaturityYear, setTdMaturityYear] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdAsset, setCreatedAsset] = useState<Asset | null>(null);

  const currencyOptions = useMemo(
    () => allowedCurrenciesFor(assetClass, market),
    [assetClass, market]
  );

  const marketOptions = useMemo(() => {
    if (assetClass === "RF" || assetClass === "FII") {
      return [{ value: "BR" as Market, label: "Brasil" }];
    }
    if (assetClass === "STOCK") {
      return [
        { value: "BR" as Market, label: "Brasil" },
        { value: "US" as Market, label: "Estados Unidos" },
      ];
    }
    return [
      { value: "BR" as Market, label: "Brasil" },
      { value: "US" as Market, label: "Estados Unidos" },
      { value: "EU" as Market, label: "Europa" },
      { value: "UK" as Market, label: "Reino Unido" },
    ];
  }, [assetClass]);

  const handleClassChange = (value: AssetClass) => {
    setAssetClass(value);
    const allowedMarkets = value === "ETF"
      ? ["BR", "US", "EU", "UK"]
      : value === "STOCK"
        ? ["BR", "US"]
        : ["BR"];
    const nextMarket = allowedMarkets.includes(market) ? market : (allowedMarkets[0] as Market);
    if (nextMarket !== market) {
      setMarket(nextMarket);
    }
    const allowedCurrencies = allowedCurrenciesFor(value, nextMarket);
    if (!allowedCurrencies.includes(quoteCurrency)) {
      setQuoteCurrency(allowedCurrencies[0]);
    }
  };

  const handleMarketChange = (value: Market) => {
    setMarket(value);
    const allowedCurrencies = allowedCurrenciesFor(assetClass, value);
    if (!allowedCurrencies.includes(quoteCurrency)) {
      setQuoteCurrency(allowedCurrencies[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const tdMaturityNum = tdMaturityYear ? Number(tdMaturityYear) : null;
      const isTesouro = assetClass === "RF";
      if (isTesouro && (!tdMaturityNum || tdMaturityNum < 2025)) {
        throw new Error("Informe um ano de vencimento válido");
      }
      const asset = await apiFetch<Asset>("/assets", {
        method: "POST",
        body: JSON.stringify({
          ticker: isTesouro ? null : ticker.toUpperCase(),
          asset_class: assetClass,
          market: assetClass === "RF" ? "BR" : market,
          quote_currency: assetClass === "RF" ? "BRL" : quoteCurrency,
          price_symbol: assetClass === "RF" ? null : priceSymbol || null,
          description,
          td_kind: isTesouro ? tdKind : null,
          td_maturity_year: isTesouro ? tdMaturityNum : null,
        }),
      });
      setCreatedAsset(asset);
      setTimeout(onSaved, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar ativo");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Adicionar Ativo</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={20} />
          </button>
        </div>

        {createdAsset ? (
          <div className="text-center py-4">
            <p className="text-[var(--color-positive)] font-medium mb-1">
              {createdAsset.ticker} adicionado!
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {createdAsset.asset_class} · {createdAsset.market} · {createdAsset.quote_currency}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isAdmin && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3">
                <p className="text-xs text-[var(--color-text-muted)]">
                  Usuarios comuns podem adicionar ao proprio catalogo apenas ativos ja existentes no catalogo global.
                  Se o ticker ainda nao existir, um administrador precisa cadastrá-lo primeiro.
                </p>
              </div>
            )}

            {assetClass !== "RF" && (
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Ticker</label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  placeholder="Ex: BOVA11, VOO, VWCE, VUKG"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                  required
                />
              </div>
            )}

            <div className={assetClass === "RF" ? "" : "grid grid-cols-2 gap-4"}>
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Classe</label>
                <select
                  value={assetClass}
                  onChange={(e) => handleClassChange(e.target.value as AssetClass)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                >
                  <option value="STOCK">Ação</option>
                  <option value="ETF">ETF</option>
                  <option value="FII">FII</option>
                  <option value="RF">Renda Fixa</option>
                </select>
              </div>

              {assetClass !== "RF" && (
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Mercado</label>
                  <select
                    value={market}
                    onChange={(e) => handleMarketChange(e.target.value as Market)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                  >
                    {marketOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {assetClass !== "RF" && (
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Moeda</label>
                <select
                  value={quoteCurrency}
                  onChange={(e) => setQuoteCurrency(e.target.value as CurrencyCode)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm"
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {assetClass === "RF" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Tipo Tesouro</label>
                  <select
                    value={tdKind}
                    onChange={(e) => setTdKind(e.target.value as TesouroKind)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm"
                  >
                    <option value="SELIC">Tesouro Selic</option>
                    <option value="IPCA+">Tesouro IPCA+</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Vencimento</label>
                  <input
                    type="number"
                    min={2025}
                    max={2100}
                    value={tdMaturityYear}
                    onChange={(e) => setTdMaturityYear(e.target.value)}
                    placeholder="2029"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm"
                    required
                  />
                </div>
              </div>
            )}

            {assetClass !== "RF" && (
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Price Symbol</label>
                <input
                  type="text"
                  value={priceSymbol}
                  onChange={(e) => setPriceSymbol(e.target.value)}
                  placeholder="Opcional. Ex: BOVA11.SA, VOO, VWCE"
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-1">Descricao</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Nome da empresa ou descricao"
                disabled={!isAdmin}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-sm"
              />
            </div>

            {error && <p className="text-sm text-[var(--color-negative)]">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Adicionando..." : "Adicionar Ativo"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
