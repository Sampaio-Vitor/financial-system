import AssetListPage from "@/components/asset-list-page";

export default function StocksPage() {
  return (
    <AssetListPage
      assetType="STOCK"
      title="Stocks (EUA)"
      emptyMessage="Nenhuma posicao em Stocks. Registre aportes para ver suas posicoes."
    />
  );
}
