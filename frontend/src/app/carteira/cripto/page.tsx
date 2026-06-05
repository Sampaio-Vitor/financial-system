import AssetListPage from "@/components/asset-list-page";

export default function CriptoPage() {
  return (
    <AssetListPage
      assetClass="CRYPTO"
      market="CRYPTO"
      title="Crypto"
      emptyMessage="Nenhuma posicao em Crypto. Registre aportes para ver suas posicoes."
    />
  );
}
