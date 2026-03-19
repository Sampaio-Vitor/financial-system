---
title: "feat: Split Dashboard into Visao Geral + Mensal Pages"
type: feat
status: active
date: 2026-03-19
origin: docs/brainstorms/2026-03-19-dashboard-split-brainstorm.md
---

# feat: Split Dashboard into Visao Geral + Mensal Pages

## Overview

Separar o dashboard atual (`/carteira`) em duas paginas distintas: **Visao Geral** (overview com estado atual da carteira) e **Mensal** (detalhamento por mes). O dashboard atual mistura dados temporais (aportes do mes, variacao) com dados gerais (evolucao do patrimonio, alocacao), tornando o painel confuso.

## Problem Statement / Motivation

O painel atual exibe 6+ secoes em uma unica pagina, combinando informacoes que servem propositos diferentes:
- **Visao geral** (patrimonio total, evolucao, alocacao) - o usuario quer ver o "agora"
- **Detalhamento mensal** (aportes, resgates, variacao, fechamento por ativo) - o usuario quer drill-down em um mes especifico

Isso gera confusao visual e cognitiva. A separacao permite cada pagina ter foco claro.

## Proposed Solution

### Pagina 1: Visao Geral (`/carteira`)

Layout de cima para baixo:

```
+--------------------------------------------------+
| Visao Geral                [Atualizar Cotacoes]   |
+--------------------------------------------------+
| [PATRIMONIO TOTAL - Hero Card - R$ XXX.XXX,XX]   |
+--------------------------------------------------+
| Alocacao por Classe       | Area de Graficos      |
| (progress bars vs meta)   | [Tab1] [Tab2] [Tab3]  |
|                           | +-----------------+   |
| STOCK  ████░░ 25% / 30%  | |                 |   |
| ACAO   ██████ 35% / 30%  | |   Chart Area    |   |
| FII    ███░░░ 15% / 20%  | |                 |   |
| RF     ██░░░░ 10% / 15%  | +-----------------+   |
| Reserva R$ XX / R$ XX    |                       |
+--------------------------------------------------+
```

**Tabs do grafico:**
1. **Evolucao do Patrimonio** (default) - area chart existente (patrimonio + investido)
2. **Aporte vs Patrimonio** - barras empilhadas: `total_invested` (base) + `rendimento` (topo)
3. **Alocacao** - donut chart com percentuais por classe, patrimonio total no centro

**Dados:** `/api/portfolio/overview` (sem month param, backend usa mes atual) + `/api/snapshots/evolution`

**Botao Atualizar Cotacoes:** sempre visivel (sem condicao de mes), atualiza patrimonio e alocacao on complete.

### Pagina 2: Mensal (`/carteira/mensal`)

Layout de cima para baixo:

```
+--------------------------------------------------+
| Mensal           [< Marco 2026 >] (click = picker)|
+--------------------------------------------------+
| Patrimonio | Aportes | Resgates | Var BRL | Var % |
+--------------------------------------------------+
| [DetailDrawer expandivel - aportes/resgates]      |
+--------------------------------------------------+
| Alocacao por Classe       | Fechamento por Ativo  |
| (progress bars vs meta)   | Ativo | Tipo | Qtd.. |
|                           | AAPL  | STOCK| 10 .. |
| ...                       | ...                   |
+--------------------------------------------------+
```

**MonthNavigator melhorado:**
- Setas esquerda/direita (como hoje)
- Clicar no nome do mes abre um month picker (grid de 12 meses + nav de ano)
- Nomes dos meses com acentos corretos ("Março" em vez de "Marco")

**Dados:** `/api/portfolio/overview?month=YYYY-MM` + `/api/snapshots/assets?month=YYYY-MM`

## Technical Considerations

### API Reuse
- **Sem mudancas no backend.** O endpoint `/api/portfolio/overview` ja aceita `month` opcional (default = mes atual). A Visao Geral chama sem month param; a Mensal chama com month param.
- A Visao Geral ignora campos nao usados da response (`transactions`, `fi_aportes`, etc.) - overhead minimo.

### Stacked Bar Chart - Data Mapping
Usa dados de `/api/snapshots/evolution` (mesmo endpoint do area chart):
- **Base (aportado):** `total_invested` de cada `PatrimonioEvolutionPoint`
- **Topo (rendimento):** `total_patrimonio - total_invested`
- Cada barra = patrimonio total do mes, com a divisao mostrando a proporcao

### Donut Chart - Data Source
Usa `allocation_breakdown` do response de `/api/portfolio/overview`:
- Segmentos: cada `ClassSummary` (STOCK, ACAO, FII, RF)
- Centro: `patrimonio_total` formatado em BRL
- Reserva financeira pode ser incluida como segmento adicional ou separado

### Month Picker
- Popover que abre ao clicar no nome do mes
- Grid 4x3 com os 12 meses do ano selecionado
- Setas para navegar entre anos
- Meses fora do range valido (antes de `minMonth`, depois do mes atual) ficam desabilitados
- Fecha ao selecionar um mes

### Component Reuse
- `AllocationBreakdown`: reutilizado em ambas paginas (mesma interface, dados diferentes)
- `PriceUpdateButton`: movido para Visao Geral (sempre visivel)
- Todos os demais componentes mensais movidos para `/carteira/mensal`

### Edge Cases
- **Mensal sem snapshot:** `SnapshotAssetsTable` mostra mensagem + botao/link para gerar snapshots
- **Primeira visita sem dados:** Visao Geral mostra R$ 0,00 + charts vazios com CTA para gerar snapshots
- **Tab state:** Reseta para tab default (Evolucao) ao navegar entre paginas (state local)
- **Charts loading:** Evolucao e Stacked Bar usam mesmos dados (fetch unico), Donut usa dados ja carregados da allocation

## Acceptance Criteria

### Sidebar & Navigation
- [ ] Sidebar mostra "Visao Geral" (LayoutDashboard icon) e "Mensal" (Calendar icon) em vez de "Painel"
- [ ] Active state funciona corretamente para cada pagina (`exact: true` para ambas)
- [ ] `/` redireciona para `/carteira` (comportamento existente mantido)

### Visao Geral (`/carteira`)
- [ ] Patrimonio Total em destaque (card hero com valor formatado em BRL)
- [ ] Botao "Atualizar Cotacoes" sempre visivel, atualiza patrimonio e alocacao on complete
- [ ] `AllocationBreakdown` mostra alocacao atual com barras de progresso vs metas
- [ ] Area de graficos com 3 tabs funcionais
- [ ] Tab "Evolucao do Patrimonio": area chart (patrimonio verde + investido violeta tracejado)
- [ ] Tab "Aporte vs Patrimonio": barras empilhadas com tooltips mostrando aportado, rendimento, total
- [ ] Tab "Alocacao": donut chart com percentuais por classe e patrimonio total no centro
- [ ] Botao "Gerar/Atualizar Snapshots" presente na area de graficos (necessario para popular charts)
- [ ] Loading skeleton adequado para a pagina

### Mensal (`/carteira/mensal`)
- [ ] MonthNavigator com setas esquerda/direita funcionando
- [ ] Clicar no nome do mes abre month picker (popover com grid de meses)
- [ ] Month picker permite selecionar apenas mes/ano (sem dia)
- [ ] Meses invalidos desabilitados no picker (antes do min_month, apos mes atual)
- [ ] Nomes dos meses com acentos corretos ("Março")
- [ ] 5 Summary Cards: Patrimonio, Aportes, Resgates, Variacao BRL, Variacao %
- [ ] DetailDrawer expandivel para Aportes e Resgates
- [ ] `AllocationBreakdown` mostra alocacao do mes selecionado
- [ ] `SnapshotAssetsTable` mostra fechamento por ativo do mes
- [ ] Empty state para meses sem snapshot inclui acao para gerar snapshots
- [ ] Loading skeleton adequado para a pagina

### Correcao de Acentos
- [ ] `getMonthLabel()` retorna "Março" (com cedilha) em vez de "Marco"
- [ ] Verificar todos os 12 nomes de meses contra portugues correto

### Novos Componentes
- [ ] `ChartTabs` - container com tabs para alternar entre graficos
- [ ] `AporteVsPatrimonioChart` - barras empilhadas (recharts BarChart + stacked bars)
- [ ] `AllocationDonutChart` - donut chart (recharts PieChart com innerRadius)
- [ ] `MonthPicker` - popover com grid de meses e nav de ano

## Implementation Phases

### Phase 1: Infraestrutura e Navegacao

**1.1 Corrigir acentos nos meses**
- **Arquivo:** `frontend/src/lib/format.ts:40`
- Mudar `"Marco"` para `"Março"`
- Verificar demais meses (todos estao corretos exceto Marco)

**1.2 Atualizar sidebar**
- **Arquivo:** `frontend/src/components/sidebar.tsx`
- Renomear "Painel" para "Visao Geral" (manter rota `/carteira`, `exact: true`)
- Adicionar "Mensal" com rota `/carteira/mensal`, icone `Calendar`, `exact: true`
- Importar `Calendar` de lucide-react

**1.3 Criar pagina Mensal**
- **Arquivo novo:** `frontend/src/app/carteira/mensal/page.tsx`
- Mover logica do `page.tsx` atual: state de `month`, `expandedCard`, fetch de `/portfolio/overview?month=`, rendering de `SummaryCards`, `DetailDrawer`, `AllocationBreakdown`, `SnapshotAssetsTable`
- Manter `MonthNavigator` no header da pagina
- Remover `PriceUpdateButton` e `PatrimonioChart` e `MonthlySnapshotsTable` desta pagina

### Phase 2: Refatorar Visao Geral

**2.1 Refatorar `/carteira/page.tsx`**
- Remover state de `month`, `expandedCard`
- Remover `MonthNavigator`, `SummaryCards`, `DetailDrawer`, `SnapshotAssetsTable`, `MonthlySnapshotsTable`
- Fetch: `/api/portfolio/overview` (sem month param) para patrimonio + alocacao
- Manter `PriceUpdateButton` (sempre visivel, sem condicao `isCurrentMonth`)
- Adicionar hero card para patrimonio total
- Manter `AllocationBreakdown` com dados atuais
- Adicionar area de tabs para graficos (Phase 3)

### Phase 3: Novos Componentes de Graficos

**3.1 ChartTabs component**
- **Arquivo novo:** `frontend/src/components/chart-tabs.tsx`
- Tab bar com 3 opcoes: "Evolucao", "Aporte vs Patrimonio", "Alocacao"
- Renderiza o grafico ativo
- Tabs responsive (text trunca ou abbrevia em mobile)
- Usar CSS variables do design system para styling

**3.2 Mover PatrimonioChart para tab**
- Refatorar `PatrimonioChart` para ser renderizado dentro da primeira tab
- Manter funcionalidade de "Gerar/Atualizar Snapshots" dentro do componente
- Garantir que os dados de evolution sejam compartilhados com o stacked bar chart (evitar fetch duplicado)

**3.3 AporteVsPatrimonioChart (novo)**
- **Arquivo novo:** `frontend/src/components/aporte-vs-patrimonio-chart.tsx`
- Recharts `BarChart` com `stackId="a"` em duas `Bar`:
  - `investido` (base) - cor: violet (#8b5cf6)
  - `rendimento` (topo, calculado: patrimonio - investido) - cor: emerald (#10b981)
- Dados: mesma response de `/api/snapshots/evolution`
- Tooltip: mes, total aportado, rendimento, patrimonio total
- Manter estilo consistente (dark tooltip, eixos com mesmas cores)

**3.4 AllocationDonutChart (novo)**
- **Arquivo novo:** `frontend/src/components/allocation-donut-chart.tsx`
- Recharts `PieChart` com `Pie` usando `innerRadius` e `outerRadius`
- Segmentos: cada classe de ativo com cor do design system (STOCK=blue, ACAO=emerald, FII=amber, RF=violet)
- Centro: patrimonio total formatado em BRL (usar `customLabel` ou overlay absoluto)
- Tooltip: classe, valor, percentual
- Dados: `allocation_breakdown` do response de overview

### Phase 4: Month Picker

**4.1 MonthPicker component (novo)**
- **Arquivo novo:** `frontend/src/components/month-picker.tsx`
- Popover/dropdown que abre ao clicar no nome do mes no MonthNavigator
- Grid 4x3 com os 12 meses do ano
- Setas no header para navegar entre anos
- Mes selecionado highlighted
- Meses fora do range (`minMonth` a mes atual) desabilitados (opacidade reduzida, nao clicaveis)
- Fecha ao selecionar um mes ou clicar fora (click outside)

**4.2 Integrar MonthPicker no MonthNavigator**
- **Arquivo:** `frontend/src/components/month-navigator.tsx`
- Adicionar state `pickerOpen`
- Nome do mes fica clicavel (`cursor-pointer`, hover effect)
- Ao clicar, abre o MonthPicker
- MonthPicker chama `onChange` com o mes selecionado

## Impacto nos Arquivos

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `frontend/src/lib/format.ts` | Editar | Corrigir "Marco" -> "Março" |
| `frontend/src/components/sidebar.tsx` | Editar | Renomear Painel, adicionar Mensal |
| `frontend/src/app/carteira/page.tsx` | Refatorar | Virar Visao Geral (remover componentes mensais, adicionar hero + tabs) |
| `frontend/src/app/carteira/mensal/page.tsx` | Novo | Pagina Mensal (mover componentes de page.tsx) |
| `frontend/src/components/chart-tabs.tsx` | Novo | Container de tabs para graficos |
| `frontend/src/components/aporte-vs-patrimonio-chart.tsx` | Novo | Stacked bar chart |
| `frontend/src/components/allocation-donut-chart.tsx` | Novo | Donut chart |
| `frontend/src/components/month-picker.tsx` | Novo | Popover de selecao de mes |
| `frontend/src/components/month-navigator.tsx` | Editar | Integrar month picker |
| `frontend/src/components/patrimonio-chart.tsx` | Editar | Adaptar para uso dentro de tab |
| `frontend/src/components/monthly-snapshots-table.tsx` | Remover | Substituido por stacked bar chart |
| `frontend/src/components/snapshot-assets-table.tsx` | Editar | Adicionar empty state com acao de gerar snapshots |

## Dependencies & Risks

- **Sem mudancas no backend** - todo o trabalho eh frontend
- **Recharts ja instalado** - BarChart e PieChart sao componentes padrao do recharts
- **Risco baixo:** todos os dados ja estao disponiveis nos endpoints existentes
- **Risco de regressao:** garantir que a pagina Mensal funcione identicamente ao dashboard atual para dados mensais
- **Decisao futura:** month state via URL params (searchParams) para deep-linking - nao incluido neste escopo

## Sources & References

### Origin
- **Brainstorm document:** [docs/brainstorms/2026-03-19-dashboard-split-brainstorm.md](docs/brainstorms/2026-03-19-dashboard-split-brainstorm.md) - Decisoes: separacao em 2 paginas, tabs para graficos, barras empilhadas, donut chart, month picker

### Internal References
- Dashboard atual: `frontend/src/app/carteira/page.tsx`
- Recharts patterns: `frontend/src/components/patrimonio-chart.tsx`
- Sidebar nav: `frontend/src/components/sidebar.tsx`
- Month helpers: `frontend/src/lib/format.ts:37-61`
- Types: `frontend/src/types/index.ts`
- CSS variables/theme: `frontend/src/app/globals.css`

### External References
- Recharts BarChart: https://recharts.org/en-US/api/BarChart
- Recharts PieChart: https://recharts.org/en-US/api/PieChart
