# Brainstorm: Separar Dashboard em Visao Geral + Mensal

**Data:** 2026-03-19
**Status:** Em definicao

## Problema

O dashboard atual (`/carteira`) mistura dados de visao geral da carteira (evolucao do patrimonio, fechamento mensal, alocacao geral) com dados especificos de um mes (aportes do mes, resgates, variacao mensal, fechamento por ativo). Isso torna o painel confuso e sem foco claro.

## O Que Vamos Construir

Separar o dashboard em duas paginas distintas no sidebar:

### 1. Visao Geral (nova home page)

Pagina focada no estado atual e evolucao historica da carteira.

**Conteudo:**
- **Patrimonio Total** em destaque (tempo real, com botao "Atualizar Cotacoes")
- **Alocacao por classe atual** (Stocks, Acoes, FIIs, RF, Reserva vs metas)
- **Area de graficos com tabs** alternando entre:
  - **Evolucao do Patrimonio** - grafico de area (patrimonio + investido ao longo do tempo)
  - **Aporte vs Patrimonio** - grafico de barras empilhadas: cada barra = patrimonio total, dividida em "total aportado" (base) e "rendimento" (topo), mostrando como aportes se tornam insignificantes com o tempo
  - **Alocacao** - donut chart com percentuais por classe e patrimonio total no centro

**Nao inclui:** tabela de fechamento mensal (nao escala), dados especificos de um mes.

### 2. Mensal (nova pagina)

Pagina focada no detalhamento de um mes especifico, com navegacao entre meses.

**Conteudo:**
- **MonthNavigator melhorado:**
  - Setas esquerda/direita (como hoje)
  - Clicar no nome do mes abre um month picker (selecao apenas de mes, sem dia)
  - Corrigir acentos nos nomes dos meses (ex: "Marco" -> "Marco" com cedilha onde aplicavel)
- **Summary Cards** (5 cards como hoje): Patrimonio no mes, Aportes, Resgates, Variacao BRL, Variacao %
- **DetailDrawer** expandivel para aportes/resgates (por classe e ativo)
- **Alocacao do mes** (breakdown por classe naquele mes especifico)
- **Fechamento por ativo** (tabela: Ativo, Tipo, Qtd, PM, Fechamento, Valor, PnL, PnL%)

## Por Que Esta Abordagem

- **Separacao de responsabilidades:** cada pagina tem um proposito claro
- **Visao geral nao precisa de navegacao temporal** - sempre mostra o "agora"
- **Mensal permite drill-down** em qualquer mes historico sem poluir a home
- **Tabs nos graficos** maximizam espaco e mantem a pagina limpa
- **Grafico de barras empilhado** (aporte vs patrimonio) comunica visualmente o poder dos juros compostos

## Decisoes Tomadas

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Sidebar | Dois itens: "Visao Geral" + "Mensal" | Separacao clara no nav |
| Patrimonio na home | Tempo real (precos atuais) | Mais util que ultimo fechamento |
| Fechamento mensal | Substituir tabela por grafico | Tabela nao escala com muitos meses |
| Layout dos graficos | Tabs (um espaco, alternar entre visoes) | Maximiza espaco, pagina limpa |
| Navegacao de meses | Setas + month picker ao clicar no mes | Rapido para adjacentes, flexivel para saltos |
| Acentos nos meses | Corrigir nomes | Bug visual atual |

## Rotas Propostas

| Rota | Pagina | Sidebar |
|------|--------|---------|
| `/carteira` | Visao Geral | "Visao Geral" (icone LayoutDashboard) |
| `/carteira/mensal` | Detalhamento Mensal | "Mensal" (icone Calendar) |

## Impacto nos Componentes Existentes

| Componente | Destino | Mudanca |
|------------|---------|---------|
| `SummaryCards` | Mensal | Mover para `/carteira/mensal` |
| `DetailDrawer` | Mensal | Mover para `/carteira/mensal` |
| `AllocationBreakdown` | Ambas | Reutilizar em ambas (geral=atual, mensal=mes especifico) |
| `PatrimonioChart` | Visao Geral | Mover para tab na home |
| `MonthlySnapshotsTable` | Remover/Substituir | Substituir por grafico na home |
| `SnapshotAssetsTable` | Mensal | Mover para `/carteira/mensal` |
| `MonthNavigator` | Mensal | Melhorar com month picker + acentos |
| `PriceUpdateButton` | Visao Geral | Mover para home (sempre mostra, nao depende de mes) |

## Novos Componentes Necessarios

- **Grafico de barras empilhadas (Aporte vs Patrimonio)** - novo componente recharts, cada barra dividida em aportado + rendimento
- **Donut chart de alocacao** - novo componente recharts com patrimonio total no centro
- **Month Picker** - dropdown/popover para selecionar mes ao clicar no nome
- **Tabs de graficos** - container com tabs para alternar entre os 3 graficos
- **Patrimonio destaque** - card/hero maior para patrimonio total na home
