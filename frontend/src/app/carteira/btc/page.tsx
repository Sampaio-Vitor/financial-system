import AssetListPage from "@/components/asset-list-page";

export default function BtcPage() {
  return (
    <AssetListPage
      assetClass="CRYPTO"
      market="CRYPTO"
      title="BTC"
      emptyMessage="Nenhuma posicao em BTC. Registre aportes para ver suas posicoes."
    />
  );
}
