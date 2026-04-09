---
title: "feat: Retirement Simulation Page (Simulacao de Aposentadoria)"
type: feat
status: completed
date: 2026-04-09
---

# Simulacao de Aposentadoria — MVP

## Overview

Nova pagina em `/carteira/aposentadoria` que mostra ao usuario quanto de renda passiva seu patrimonio pode gerar usando a regra dos 4%, quanto falta para atingir uma meta, e em quanto tempo chega la com aportes regulares. A meta de patrimonio, taxa de retirada e rentabilidade esperada ficam persistidas no backend por usuario.

## Dados de Entrada (do Backend)

Fetch `GET /retirement/overview` para obter:
- `patrimonio_atual` (inclui reserva) — ponto de partida da simulacao
- `aporte_medio_mensal` — baseado no historico de aportes do usuario
- `patrimonio_meta`, `taxa_retirada`, `rentabilidade_anual` — parametros persistidos por usuario

Persistencia via `PUT /retirement/goal`.

## Inputs Interativos do Usuario

| Campo | Tipo | Default | Min | Max | Step |
|---|---|---|---|---|---|
| Meta de patrimonio | BRL | vazio | > R$ 0 | - | R$ 1 |
| Rentabilidade anual esperada | % | 8% | 0% | 100% | 0.5% |
| Taxa de retirada anual | % | 4% | > 0% | 100% | 0.5% |

**Formato de input:** editor inline com campos numericos; a meta de patrimonio usa mascara de milhares no padrao pt-BR.

## Logica de Calculo

### Formulas Core

```
progresso = patrimonio_atual / patrimonio_meta * 100
renda_passiva_atual = patrimonio_atual * taxa_retirada / 12
renda_passiva_meta = patrimonio_meta * taxa_retirada / 12
```

### Projecao Mensal (juros compostos mensais)

```
taxa_mensal = (1 + taxa_anual) ^ (1/12) - 1
Para cada mes m:
  patrimonio[m] = patrimonio[m-1] * (1 + taxa_mensal) + aporte_medio_mensal
  Se patrimonio[m] >= patrimonio_meta: anos_para_meta = m / 12
```

- **Cap maximo:** 50 anos (600 meses). Se nao atingir, mostrar "Meta nao atingivel com estes parametros"
- **Granularidade do chart:** pontos anuais (1 por ano, max 50 pontos)

### Meta ja atingida

Se `patrimonio_atual >= patrimonio_meta`: estado especial "Parabens! Voce ja pode se aposentar com essa renda" com destaque visual positivo.

## Layout da Pagina

### 1. Header
```
Simulacao de Aposentadoria
```

### 2. Summary Cards (4 cards em grid)

| Card | Valor | Cor |
|---|---|---|
| Patrimonio Atual | `patrimonio_atual` formatado | primary |
| Renda Passiva Atual | patrimonio * taxa_retirada / 12 | positive |
| Renda na Meta | patrimonio_meta * taxa_retirada / 12 | primary |
| Progresso | patrimonio / meta * 100 (com barra) | accent |

### 3. Configuracoes

Editor inline para meta de patrimonio, taxa de retirada anual e rentabilidade anual esperada.

### 4. Grafico de Projecao (recharts AreaChart)

- **Eixo X:** Anos (0, 1, 2, ... ate meta ou 50)
- **Eixo Y:** Patrimonio em BRL (formatado abreviado: R$100k, R$1M, R$1.5M)
- **Area:** projecao do patrimonio (cor accent com gradiente)
- **ReferenceLine horizontal tracejada:** patrimonio_meta (cor positive)

### 5. Tabela de Cenarios

5 linhas comparando diferentes aportes mensais:

| Aporte Mensal | Patrimonio em 10a | Patrimonio em 20a | Anos ate Meta | Renda Mensal em 10a |
|---|---|---|---|---|
| base * 0.5 | ... | ... | ... | ... |
| base * 0.75 | ... | ... | ... | ... |
| **base (atual)** | ... | ... | ... | ... |
| base * 1.25 | ... | ... | ... | ... |
| base * 1.5 | ... | ... | ... | ... |

Linha "atual" destacada com fundo accent sutil.

### 6. Disclaimer (footer sutil)

> "Simulacao simplificada para fins educacionais. Resultados reais dependem de condicoes de mercado, impostos e inflacao. Isso nao constitui recomendacao de investimento."

## Arquivos a Criar/Modificar

### Criar

- `frontend/src/app/carteira/aposentadoria/page.tsx` — pagina principal
- `backend/app/routers/retirement.py` — endpoints de meta e overview
- `backend/app/models/retirement_goal.py` — modelo de meta por usuario
- `backend/alembic/versions/017_add_retirement_goals.py` — migration da tabela `retirement_goals`

### Modificar

- `frontend/src/components/sidebar.tsx` — adicionar item "Aposentadoria" no `navItems` (apos "Historico", ~linha 91)
  - Icon: `Target` de lucide-react (representa meta/objetivo)
  - `{ label: "Aposentadoria", href: "/carteira/aposentadoria", icon: Target }`

### Nao criar

- Nenhum componente separado (tudo inline na page.tsx pro MVP)

## Formatacao de Valores

- Usar `formatBRL()` de `@/lib/format.ts:1` para valores monetarios
- Usar `formatPercent()` de `@/lib/format.ts:37` para percentuais
- Para eixo Y do chart com valores grandes: criar helper local `formatBRLShort()`:
  - `>= 1_000_000` → `R$1,2M`
  - `>= 1_000` → `R$150k`

## Design System

Seguir padroes existentes:
- Cards: `bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-5`
- Texto: `var(--color-text-primary)`, `var(--color-text-secondary)`, `var(--color-text-muted)`
- Positivo/Negativo: `var(--color-positive)` / `var(--color-negative)`
- Accent: `var(--color-accent)` para elementos interativos e highlights
- Skeleton loading: `animate-pulse h-XX rounded-xl bg-[var(--color-bg-card)]`

## Edge Cases

| Caso | Comportamento |
|---|---|
| Patrimonio = 0 | Cards mostram R$0, projecao comeca do zero, funciona normalmente |
| Aporte = 0 | Crescimento so por rendimento, timeline mais longa |
| Meta ja atingida | Estado "Parabens", progresso mostra >100%, chart mostra excedente |
| Meta inalcancavel (50a+) | Mensagem "Meta nao atingivel com estes parametros em 50 anos" |
| API falha | Skeleton → mensagem de erro com botao "Tentar novamente" |
| Sem historico de aporte | `aporte_medio_mensal` fica R$0 e a projecao usa crescimento por rentabilidade |

## Acceptance Criteria

- [x] Pagina acessivel em `/carteira/aposentadoria`
- [x] Link no sidebar com icone
- [x] Summary cards mostram patrimonio atual, renda passiva atual, meta, progresso
- [x] Inputs de meta, rentabilidade e taxa de retirada
- [x] Persistencia da meta por usuario
- [x] Grafico de projecao com area + linha de meta
- [x] Tabela de cenarios com 5 variações de aporte
- [x] Estado especial quando meta ja atingida
- [x] Cap de 50 anos na projecao
- [x] Loading skeleton enquanto busca dados
- [x] Responsivo (mobile-friendly)
- [x] Disclaimer no footer

## Fora do Escopo (MVP)

- Persistencia de inputs via localStorage/URL params — futuro
- Dados historicos de rentabilidade real da carteira — futuro
- Calculo de impostos sobre retirada — futuro
- Multiplos cenarios de rentabilidade (otimista/moderado/pessimista) — futuro
- Integracao com dados de dividendos reais (yield da carteira) — futuro
