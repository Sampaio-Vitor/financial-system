# Implementation Plan: Dashboard Split - Visao Geral + Mensal

See full plan: docs/plans/2026-03-19-feat-dashboard-split-visao-geral-mensal-plan.md

## Phases

### Phase 1: Infraestrutura e Navegacao
- [x] 1.1 Corrigir acentos nos meses (format.ts)
- [x] 1.2 Atualizar sidebar (renomear Painel, adicionar Mensal)
- [x] 1.3 Criar pagina Mensal (mover componentes mensais)

### Phase 2: Refatorar Visao Geral
- [x] 2.1 Refatorar /carteira/page.tsx (hero patrimonio + alocacao + area de tabs)

### Phase 3: Novos Componentes de Graficos
- [x] 3.1 ChartTabs component
- [x] 3.2 Mover PatrimonioChart para tab
- [x] 3.3 AporteVsPatrimonioChart (stacked bar)
- [x] 3.4 AllocationDonutChart (donut)

### Phase 4: Month Picker
- [x] 4.1 MonthPicker component
- [x] 4.2 Integrar MonthPicker no MonthNavigator
