import AssetListPage from "@/components/asset-list-page";

export default function AcoesPage() {
  return (
    <AssetListPage
      assetClass="STOCK"
      market="BR"
      title="Ações (Brasil)"
      emptyMessage="Nenhuma posição em Ações. Registre aportes para ver suas posições."
    />
  );
}
