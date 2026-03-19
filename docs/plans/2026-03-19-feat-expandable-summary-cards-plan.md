---
title: "feat: Expandable Summary Cards — Aportes & Resgates"
type: feat
status: active
date: 2026-03-19
origin: docs/brainstorms/2026-03-19-expandable-summary-cards-brainstorm.md
---

# feat: Expandable Summary Cards — Aportes & Resgates

## Overview

Tornar os cards "Aportes do Mes" e "Resgates do Mes" clicaveis. Ao clicar, um drawer full-width aparece abaixo da row de cards mostrando o detalhamento agrupado por classe de ativo (Stocks, Acoes, FIIs, RF, Reserva) com subtotal por grupo. So 1 drawer aberto por vez (accordion). Os outros 3 cards permanecem estaticos.

## Proposed Solution

### Backend: Enviar dados detalhados no overview

O backend ja calcula os totais de aportes/resgates, mas nao envia os itens individuais. Precisamos adicionar 3 campos ao `MonthlyOverview`:

1. **`fi_redemptions`** — lista de `FixedIncomeRedemption` do mes (para detalhar resgates RF)
2. **`fi_aportes`** — lista de posicoes RF iniciadas no mes (para detalhar aportes RF)
3. **`reserva_aporte`** — valor da variacao da reserva (ja calculado, so nao retornado)

#### `backend/app/schemas/portfolio.py`

Adicionar schema para itens RF e campos novos no MonthlyOverview:

```python
class FixedIncomeTransactionItem(BaseModel):
    ticker: str
    description: str
    date: date
    amount: Decimal

class MonthlyOverview(BaseModel):
    # ... campos existentes ...
    fi_aportes: list[FixedIncomeTransactionItem]       # NEW
    fi_redemptions: list[FixedIncomeTransactionItem]    # NEW
    reserva_aporte: Decimal                             # NEW
```

#### `backend/app/routers/portfolio.py`

No endpoint `get_overview`, apos calcular `resgates_do_mes`:

```python
# Query RF aportes (posicoes iniciadas no mes) - para detalhe
fi_aportes_result = await db.execute(
    select(FixedIncomePosition)
    .where(
        FixedIncomePosition.user_id == user.id,
        FixedIncomePosition.start_date >= month_start,
        FixedIncomePosition.start_date < month_end,
    )
)
fi_aportes_list = [
    FixedIncomeTransactionItem(
        ticker=fi.asset.ticker if fi.asset else "RF",
        description=fi.description,
        date=fi.start_date,
        amount=fi.applied_value,
    )
    for fi in fi_aportes_result.scalars().all()
]

# Query RF resgates (redemptions no mes) - para detalhe
fi_resgates_result = await db.execute(
    select(FixedIncomeRedemption)
    .where(
        FixedIncomeRedemption.user_id == user.id,
        FixedIncomeRedemption.redemption_date >= month_start,
        FixedIncomeRedemption.redemption_date < month_end,
    )
)
fi_redemptions_list = [
    FixedIncomeTransactionItem(
        ticker=fi.ticker,
        description=fi.description,
        date=fi.redemption_date,
        amount=fi.amount,
    )
    for fi in fi_resgates_result.scalars().all()
]
```

E no return:
```python
return MonthlyOverview(
    # ... existentes ...
    fi_aportes=fi_aportes_list,
    fi_redemptions=fi_redemptions_list,
    reserva_aporte=round(reserva_aporte, 4),
)
```

### Frontend: Types

#### `frontend/src/types/index.ts`

```typescript
export interface FixedIncomeTransactionItem {
  ticker: string;
  description: string;
  date: string;
  amount: number;
}

export interface MonthlyOverview {
  // ... existentes ...
  fi_aportes: FixedIncomeTransactionItem[];
  fi_redemptions: FixedIncomeTransactionItem[];
  reserva_aporte: number;
}
```

### Frontend: SummaryCards com expand

#### `frontend/src/components/summary-cards.tsx`

Adicionar props para controlar quais cards sao expansiveis:

```typescript
interface CardData {
  label: string;
  value: number;
  format: "brl" | "percent";
  colorBySign?: boolean;
  expandable?: boolean;  // NEW
}

interface SummaryCardsProps {
  cards: CardData[];
  expandedCard: string | null;        // NEW - controlado pelo pai
  onToggleCard: (label: string) => void;  // NEW
}
```

Mudancas visuais no card expansivel:
- `cursor-pointer` no hover
- Icone `ChevronDown` do lucide-react (rota pra `ChevronUp` quando aberto)
- Borda de destaque quando aberto (`border-[var(--color-accent)]`)

#### `frontend/src/app/carteira/page.tsx`

Estado e drawer:

```typescript
const [expandedCard, setExpandedCard] = useState<string | null>(null);

// No JSX, entre SummaryCards e Reserva:
<SummaryCards
  cards={[
    { label: "Patrimonio Total", value: data.patrimonio_total, format: "brl" },
    { label: "Aportes do Mes", value: data.aportes_do_mes, format: "brl", expandable: true },
    { label: "Resgates do Mes", value: data.resgates_do_mes, format: "brl", expandable: true },
    { label: "Variacao do Mes", value: data.variacao_mes, format: "brl", colorBySign: true },
    { label: "Variacao (%)", value: data.variacao_mes_pct, format: "percent", colorBySign: true },
  ]}
  expandedCard={expandedCard}
  onToggleCard={(label) => setExpandedCard(prev => prev === label ? null : label)}
/>

{/* Detail drawer */}
{expandedCard === "Aportes do Mes" && (
  <DetailDrawer type="aportes" data={data} />
)}
{expandedCard === "Resgates do Mes" && (
  <DetailDrawer type="resgates" data={data} />
)}
```

### Frontend: Componente DetailDrawer

#### `frontend/src/components/detail-drawer.tsx` (NOVO)

Componente que renderiza o breakdown agrupado por classe.

**Logica de agrupamento:**

Para **Aportes**:
1. Filtra `transactions` onde `quantity > 0`, agrupa por `asset_type`
2. Adiciona grupo "Renda Fixa" com itens de `fi_aportes`
3. Se `reserva_aporte > 0`, adiciona grupo "Reserva" com 1 item

Para **Resgates**:
1. Filtra `transactions` onde `quantity < 0`, agrupa por `asset_type`
2. Adiciona grupo "Renda Fixa" com itens de `fi_redemptions`
3. Se `reserva_aporte < 0`, adiciona grupo "Reserva" com 1 item (valor absoluto)

**Visual por grupo:**
- Icone + cor da classe (mesmo mapeamento de `allocation-breakdown.tsx`: STOCK=blue, ACAO=green, FII=orange, RF=purple, Reserva=cyan)
- Header: `[Icon] Label — Subtotal: R$ X.XXX,XX`
- Lista de itens: `Ticker | Data | Valor`
- Grupos vazios: nao renderizar (ocultar)

**Animacao:**
- `transition-all duration-300 ease-in-out` no container
- `overflow-hidden` com `max-h-0` -> `max-h-[600px]` para transicao suave
- Ou usar `grid-rows` animation pattern: `grid-rows-[0fr]` -> `grid-rows-[1fr]`

**Empty state:**
- Se nao ha nenhum item: mostrar "Nenhum aporte neste periodo" / "Nenhum resgate neste periodo"

## Acceptance Criteria

- [ ] Clicar em "Aportes do Mes" abre drawer com compras RV + aportes RF + reserva (se aumentou)
- [ ] Clicar em "Resgates do Mes" abre drawer com vendas RV + resgates RF + reserva (se diminuiu)
- [ ] Itens agrupados por classe de ativo com icone, cor e subtotal
- [ ] Grupos vazios nao aparecem
- [ ] So 1 drawer aberto por vez
- [ ] Clicar no card aberto fecha o drawer
- [ ] Cards expansiveis tem chevron e cursor-pointer
- [ ] Card aberto tem borda de destaque
- [ ] Transicao suave ao abrir/fechar (CSS, ~300ms)
- [ ] Os 3 cards nao-expansiveis continuam estaticos
- [ ] Responsivo: funciona em mobile (cards empilhados, drawer full-width)

## Files

| File | Action |
|---|---|
| `backend/app/schemas/portfolio.py` | Add FixedIncomeTransactionItem, add 3 fields to MonthlyOverview |
| `backend/app/routers/portfolio.py` | Query fi_aportes + fi_redemptions, return reserva_aporte |
| `frontend/src/types/index.ts` | Add FixedIncomeTransactionItem, update MonthlyOverview |
| `frontend/src/components/summary-cards.tsx` | Add expandable prop, chevron, click handler, active state |
| `frontend/src/components/detail-drawer.tsx` | NEW — grouped breakdown drawer |
| `frontend/src/app/carteira/page.tsx` | Add expandedCard state, render DetailDrawer |

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-03-19-expandable-summary-cards-brainstorm.md](docs/brainstorms/2026-03-19-expandable-summary-cards-brainstorm.md) — Key decisions: only 2 cards expandable, full-width drawer, grouped by class, accordion behavior
- Existing visual patterns: `frontend/src/components/allocation-breakdown.tsx` (icons, colors per class)
- Transaction display: `frontend/src/components/month-transactions.tsx` (item layout pattern)
- Animation reference: sidebar collapse pattern in `frontend/src/components/sidebar.tsx` (transition-all duration-300)
