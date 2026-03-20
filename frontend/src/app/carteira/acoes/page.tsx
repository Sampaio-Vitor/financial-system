import AssetListPage from "@/components/asset-list-page";

export default function AcoesPage() {
  return (
    <AssetListPage
      assetType="ACAO"
      title="Acoes (Brasil)"
      emptyMessage="Nenhuma posicao em Acoes. Registre aportes para ver suas posicoes."
    />
  );
}
