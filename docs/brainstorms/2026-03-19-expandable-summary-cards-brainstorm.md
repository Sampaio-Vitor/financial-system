# Expandable Summary Cards — Aportes & Resgates

**Date:** 2026-03-19
**Status:** Ready for planning

## What We're Building

Dois dos 5 summary cards no Painel ("Aportes do Mes" e "Resgates do Mes") se tornam clicaveis. Ao clicar, uma secao full-width aparece abaixo da row de cards com o detalhamento agrupado por classe de ativo (Stocks, Acoes, FIIs, RF), com subtotal por grupo.

Comportamento:
- So 1 card aberto por vez (clicar em outro fecha o atual)
- Clicar no mesmo card fecha
- A secao de detalhe aparece entre os cards e a Reserva Financeira, como um "drawer" que desce organicamente
- Os outros 3 cards (Patrimonio Total, Variacao do Mes, Variacao %) NAO sao expansiveis

## Why This Approach

- Simples: so 2 cards precisam de detalhe, nao todos
- Full-width abaixo da row: espaco suficiente pra mostrar breakdown por classe sem comprimir
- Agrupado por tipo: alinha com a estrutura de dados que ja existe (allocation_breakdown, transactions por asset_type)
- 1 aberto por vez: mantem o painel limpo

## Key Decisions

1. **Apenas 2 cards expansiveis** — Aportes do Mes e Resgates do Mes
2. **Drawer full-width** — aparece abaixo da row de cards, nao dentro do card individual
3. **Agrupado por classe** — Stocks, Acoes, FIIs, RF com subtotal por grupo
4. **1 aberto por vez** — toggle accordion style
5. **Animacao CSS pura** — Tailwind transition-all, sem lib externa (consistente com o resto do projeto)

## Detail Content

### Aportes do Mes (expanded)
- Agrupa `transactions` onde `quantity > 0` por `asset_type`
- Inclui aportes de RF (FixedIncomePosition.start_date no mes)
- Inclui aporte de reserva (se reserva aumentou)
- Cada grupo: icone + label + lista de itens (ticker, data, valor) + subtotal

### Resgates do Mes (expanded)
- Agrupa vendas RV (`transactions` onde `quantity < 0`) por `asset_type`
- Inclui resgates RF (FixedIncomeRedemption no mes)
- Inclui resgate de reserva (se reserva diminuiu)
- Mesmo formato visual que Aportes

## Data Availability

- Transactions ja vem no MonthlyOverview (purchases do mes)
- Resgates RF: precisam vir do backend (hoje nao estao no overview)
- Reserva aporte/resgate: pode ser calculado no frontend (reserva atual - reserva anterior) ou vir do backend

## Open Questions

Nenhuma — escopo definido.

## Files Affected

| File | Change |
|---|---|
| `frontend/src/components/summary-cards.tsx` | Add click handler, expanded state, visual indicator nos 2 cards |
| `frontend/src/app/carteira/page.tsx` | Render detail drawer entre SummaryCards e Reserva |
| `backend/app/routers/portfolio.py` | Incluir resgates RF e detalhe de reserva no overview response |
| `backend/app/schemas/portfolio.py` | Campos adicionais no MonthlyOverview se necessario |
| `frontend/src/types/index.ts` | Tipos novos se schema mudar |
