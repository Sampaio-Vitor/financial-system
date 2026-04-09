import AssetListPage from "@/components/asset-list-page";

export default function StocksPage() {
  return (
    <AssetListPage
      assetClass="STOCK"
      market="US"
      title="Stocks (EUA)"
      emptyMessage="Nenhuma posicao em Stocks. Registre aportes para ver suas posicoes."
    />
  );
}
