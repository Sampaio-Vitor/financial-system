---
title: "feat: Reorganize Ativos Desejados into Catalogo and Planejador de Aporte"
type: feat
status: completed
date: 2026-03-19
origin: docs/brainstorms/2026-03-19-asset-catalog-reorganization-brainstorm.md
---

# Reorganizar Ativos Desejados em Catalogo e Planejador de Aporte

## Overview

Separar a pagina monolitica "Ativos Desejados" (`/desejados/page.tsx`, 404 linhas) em duas paginas com responsabilidades claras:

1. **Catalogo** (`/carteira/catalogo`) - Gerenciamento de ativos e metas de alocacao, dentro do grupo Ativos no sidebar.
2. **Planejador de Aporte** (`/desejados`) - Calculadora de rebalanceamento, renomeada com icone de calculadora.

Adicionalmente, remover a funcionalidade de exclusao de ativos (frontend e backend).

## Problem Statement / Motivation

A pagina atual acumula tres responsabilidades distintas: catalogo de ativos, metas de alocacao e calculadora de rebalanceamento. O catalogo pertence logicamente ao grupo "Ativos" no sidebar, enquanto o planejador e uma ferramenta independente. A exclusao de ativos e perigosa (o backend so protege contra `Purchase` mas nao contra `FixedIncomePosition`) e deve ser removida.

(see brainstorm: docs/brainstorms/2026-03-19-asset-catalog-reorganization-brainstorm.md)

## Proposed Solution

### Fase 1: Criar pagina Catalogo (`/carteira/catalogo`)

**Novo arquivo:** `frontend/src/app/carteira/catalogo/page.tsx`

Pagina com duas abas controladas por `searchParams` (`?tab=ativos` | `?tab=metas`):

**Aba "Ativos" (default):**
- Header com contagem de ativos e botao "Adicionar Ativo"
- Filtros tipo toggle pills: `Todos | Stocks (EUA) | Acoes (Brasil) | FIIs | Renda Fixa`
  - Usar o pattern "pill tabs" do `ChartTabs` (`bg-[var(--color-bg-main)] rounded-lg p-1`)
  - Filtro "Todos" mostra o grid completo 4 colunas (identico ao atual)
  - Filtro especifico mostra apenas os cards dos tipos selecionados, grid adapta o numero de colunas
- Grid de cards por tipo de ativo (extraido do `/desejados/page.tsx` linhas 361-400)
- Botao "Adicionar Ativo" abre o `AssetForm` modal existente
- **Sem icone de lixeira** - funcionalidade de delete removida

**Aba "Metas":**
- Migra a secao "Metas de Alocacao" do `/desejados/page.tsx` (linhas 126-168)
- 4 inputs de percentual (STOCK, ACAO, FII, RF) + total + botao "Salvar Metas"
- Mesma validacao: soma deve ser 100% (tolerancia 0.1%)

**Abas controladas por URL:**
- Usar `useSearchParams()` do Next.js para controlar a aba ativa
- Default: `?tab=ativos`
- Permite deep-link: `/carteira/catalogo?tab=metas`

### Fase 2: Simplificar pagina Planejador de Aporte (`/desejados`)

**Modificar:** `frontend/src/app/desejados/page.tsx`

- Titulo muda de "Ativos Desejados" para "Planejador de Aporte"
- Remove secoes de Metas de Alocacao e Catalogo de Ativos
- Mantem apenas a secao "Plano de Aporte" (linhas 170-335)
- **Novo: Banner de aviso quando nao ha metas configuradas:**
  - Buscar `/api/allocation-targets` no mount
  - Se vazio, mostrar banner: "Nenhuma meta de alocacao configurada. Configure suas metas no Catalogo."
  - Link direto para `/carteira/catalogo?tab=metas`
  - Botao "Calcular" fica desabilitado enquanto nao houver metas

### Fase 3: Atualizar sidebar

**Modificar:** `frontend/src/components/sidebar.tsx`

```
Ativos (grupo expandivel):
  + Catalogo          -> /carteira/catalogo  (BookOpen) [NOVO - primeiro item]
    Stocks (EUA)      -> /carteira/stocks    [sem mudanca]
    Acoes (Brasil)    -> /carteira/acoes     [sem mudanca]
    FIIs              -> /carteira/fiis      [sem mudanca]
    Renda Fixa        -> /carteira/renda-fixa [sem mudanca]
    Reserva           -> /carteira/reserva   [sem mudanca]

- Ativos Desejados   -> /desejados          (Target)
+ Planejador de Aporte -> /desejados         (Calculator)
```

Mudancas:
- Adicionar `{ label: "Catalogo", href: "/carteira/catalogo", icon: BookOpen }` como primeiro filho do grupo Ativos
- Renomear "Ativos Desejados" para "Planejador de Aporte"
- Trocar icone de `Target` para `Calculator`

### Fase 4: Remover exclusao de ativos

**Frontend** (`frontend/src/app/desejados/page.tsx` → ja removido na Fase 2):
- O handler `handleDeleteAsset` e o icone `Trash2` nao serao migrados para o Catalogo

**Backend** (`backend/app/routers/assets.py` linhas 79-97):
- Remover o endpoint `DELETE /api/assets/{asset_id}`
- Remover import de `Purchase` se nao for mais usado

## Technical Considerations

### Arquivos a criar
- `frontend/src/app/carteira/catalogo/page.tsx` - Nova pagina Catalogo

### Arquivos a modificar
- `frontend/src/app/desejados/page.tsx` - Simplificar para so Planejador + banner de metas
- `frontend/src/components/sidebar.tsx` - Adicionar Catalogo, renomear Ativos Desejados
- `backend/app/routers/assets.py` - Remover endpoint DELETE

### Arquivos que NAO mudam
- `frontend/src/components/asset-form.tsx` - Reutilizado como esta
- `frontend/src/app/desejados/layout.tsx` - Rota mantem `/desejados`, layout fica
- `frontend/src/app/carteira/layout.tsx` - Nova pagina herda este layout automaticamente
- `backend/app/routers/allocation.py` - Endpoints de metas permanecem iguais
- `backend/app/routers/rebalancing.py` - Endpoint de rebalanceamento permanece igual

### Dependencia entre paginas
- O Planejador depende de metas configuradas (via `/api/allocation-targets`)
- O backend busca metas do DB a cada calculo, nao ha cache client-side entre paginas
- O banner + link no Planejador resolve a descobribilidade

### Tabs com searchParams
- `useSearchParams()` requer `"use client"` (ja e o padrao do projeto)
- `useRouter()` para `router.push` ao trocar de aba sem reload

## Acceptance Criteria

- [x] Nova pagina Catalogo acessivel em `/carteira/catalogo` com aba Ativos e aba Metas
- [x] Aba Ativos mostra grid de ativos com filtros por tipo (Todos/Stocks/Acoes/FIIs/RF)
- [x] Aba Ativos tem botao "Adicionar Ativo" que abre o AssetForm modal
- [x] Aba Ativos **nao** tem opcao de excluir ativos
- [x] Aba Metas permite configurar e salvar metas de alocacao (soma = 100%)
- [x] Tabs controladas por `searchParams` (deep-link: `/carteira/catalogo?tab=metas`)
- [x] Sidebar mostra "Catalogo" como primeiro item do grupo Ativos (icone BookOpen)
- [x] Sidebar mostra "Planejador de Aporte" no lugar de "Ativos Desejados" (icone Calculator)
- [x] Pagina Planejador de Aporte mantem apenas a calculadora de rebalanceamento
- [x] Planejador mostra banner com link quando nao ha metas configuradas + botao Calcular desabilitado
- [x] Endpoint `DELETE /api/assets/{asset_id}` removido do backend
- [x] Rota `/desejados` continua funcionando (nao quebra bookmarks)

## Dependencies & Risks

- **Baixo risco:** Maioria do codigo e migracao (copiar/colar de `/desejados/page.tsx`)
- **Unico endpoint removido:** DELETE de assets - sem impacto em outras features
- **Layout:** Nova pagina em `/carteira/catalogo` herda automaticamente o `carteira/layout.tsx`
- **Tech debt nao abordado:** Layouts duplicados (`desejados/layout.tsx` vs `carteira/layout.tsx`) - pode ser consolidado futuramente

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-19-asset-catalog-reorganization-brainstorm.md](docs/brainstorms/2026-03-19-asset-catalog-reorganization-brainstorm.md) — Decisoes: nome "Catalogo", filtros em vez de abas por tipo, remocao total de delete, abas com searchParams
- Pagina atual: `frontend/src/app/desejados/page.tsx` (404 linhas, 3 secoes)
- Sidebar: `frontend/src/components/sidebar.tsx` (215 linhas)
- Tab pattern de referencia: `frontend/src/components/chart-tabs.tsx` (pill tabs)
- Backend assets: `backend/app/routers/assets.py` (DELETE endpoint linhas 79-97)
- Backend allocation: `backend/app/routers/allocation.py`
