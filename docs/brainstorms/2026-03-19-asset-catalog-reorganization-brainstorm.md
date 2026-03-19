# Brainstorm: Reorganizacao da Pagina de Ativos Desejados

**Data:** 2026-03-19
**Status:** Em revisao

## O que estamos construindo

Reorganizar a pagina "Ativos Desejados" que hoje acumula funcionalidades demais (catalogo de ativos, metas de alocacao e planejador de aporte) em duas paginas distintas com propositos claros:

1. **"Catalogo"** - Nova pagina dentro do grupo Ativos no sidebar, dedicada ao gerenciamento de ativos e metas de alocacao.
2. **"Planejador de Aporte"** - Pagina renomeada (antigo "Ativos Desejados") focada exclusivamente no calculo de rebalanceamento.

Alem disso, remover completamente a funcionalidade de exclusao de ativos (tanto frontend quanto backend).

## Por que essa abordagem

- A pagina atual mistura responsabilidades: catalogo de ativos, configuracao de metas e calculo de aportes numa unica tela.
- O catalogo de ativos faz mais sentido dentro do grupo "Ativos" no sidebar, proximo das paginas de cada tipo.
- O planejador de aporte e uma ferramenta de calculo separada, nao tem relacao direta com o catalogo.
- Deletar ativos e perigoso (pode quebrar dados historicos) e o backend ja bloqueia para ativos com compras, mas nao para RF. Melhor remover a opcao.

## Decisoes-chave

### 1. Estrutura do sidebar

```
Sidebar:
  - Visao Geral          -> /carteira           (LayoutDashboard) [sem mudanca]
  - Mensal               -> /carteira/mensal    (Calendar) [sem mudanca]
  - Ativos (grupo expandivel):
      - Catalogo          -> /carteira/catalogo  (BookOpen) [NOVO - primeiro item]
      - Stocks (EUA)      -> /carteira/stocks    [sem mudanca]
      - Acoes (Brasil)    -> /carteira/acoes     [sem mudanca]
      - FIIs              -> /carteira/fiis      [sem mudanca]
      - Renda Fixa        -> /carteira/renda-fixa [sem mudanca]
      - Reserva           -> /carteira/reserva   [sem mudanca]
  - Aportes em RV         -> /carteira/aportes   [sem mudanca]
  - Planejador de Aporte  -> /desejados          (Calculator) [RENOMEADO]
```

### 2. Pagina "Catalogo" (/carteira/catalogo)

- **Duas abas internas:** "Ativos" e "Metas"
- **Aba Ativos:**
  - Mesma visualizacao atual (grid 4 colunas com cards por tipo)
  - Filtros por tipo de ativo (botoes toggle: Todos, Stocks, Acoes, FIIs, RF)
  - Botao "Adicionar Ativo" usando o mesmo `AssetForm` modal
  - **Sem botao de excluir** - icone de lixeira removido
- **Aba Metas:**
  - Migra a secao "Metas de Alocacao" da pagina atual
  - Mesma funcionalidade: 4 inputs de percentual + botao salvar
  - Validacao de soma = 100%

### 3. Pagina "Planejador de Aporte" (/desejados)

- Mantem apenas a secao "Plano de Aporte" (calculo de rebalanceamento)
- Titulo muda de "Ativos Desejados" para "Planejador de Aporte"
- Icone no sidebar muda de Target para Calculator
- Rota permanece `/desejados` (evita quebrar bookmarks)
- Remove as secoes de Metas e Catalogo de Ativos

### 4. Remocao da exclusao de ativos

- **Frontend:** Remover icone de lixeira e handler `handleDeleteAsset`
- **Backend:** Remover endpoint `DELETE /api/assets/{asset_id}`
- **Migracao:** Nenhuma necessaria (nao altera schema do banco)

## Questoes resolvidas

- **Nome da nova pagina:** "Catalogo" (evita confusao com a "Visao Geral" do dashboard principal)
- **Abas vs filtros:** Uma unica lista "Todos" com filtros por tipo (sem abas separadas por tipo)
- **Info por ativo:** Manter o que ja existe hoje (ticker, tipo, grid por classe) - sem adicionar preco/posicao
- **Posicao no sidebar:** Catalogo como primeiro item dentro do grupo Ativos
- **Planejador de Aporte:** Continua como item separado fora do grupo Ativos, na mesma posicao
