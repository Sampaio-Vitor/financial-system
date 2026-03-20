import AssetListPage from "@/components/asset-list-page";

export default function FIIsPage() {
  return (
    <AssetListPage
      assetType="FII"
      title="FIIs"
      emptyMessage="Nenhuma posicao em FIIs. Registre aportes para ver suas posicoes."
    />
  );
}
