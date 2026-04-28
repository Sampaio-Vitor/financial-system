---
title: Per-Asset Allocation Target (% por ativo)
type: feat
status: completed
date: 2026-04-28
---

# Per-Asset Allocation Target

## Overview

Permitir que o usuário defina uma % alvo **por ativo** dentro de cada bucket de alocação (`STOCK_BR`, `STOCK_US`, `ETF_INTL`, `FII`, `RF*`...). Hoje o `RebalancingService` distribui o alvo do bucket igualmente entre todos os ativos não-pausados (`backend/app/services/rebalancing_service.py:117`). Após esta mudança, ativos com `target_pct` explícito recebem exatamente essa fração do bucket; ativos sem `target_pct` dividem **igualmente** o que sobra.

## Problem Statement / Motivation

A divisão por peso igual dentro do bucket assume que todos os ativos têm a mesma convicção/tamanho desejado, o que raramente é verdade. O usuário quer expressar convicção (ex: "PETR4 deve ser 30% das minhas Ações BR; AGRO3 e VALE3 dividem o resto"). A abstração de bucket permanece útil pra alvos macro; o que falta é granularidade por ativo dentro do bucket.

## Proposed Solution

Adicionar coluna `target_pct NUMERIC(5,4) NULL` em `user_assets`. NULL = ativo segue o regime de peso igual (compatível com hoje). Quando preenchido, representa **fração do bucket** (não do portfólio total).

Algoritmo de rebalanceamento por bucket:

```
bucket_target_value = investable_pos_aporte * bucket_target_pct
ativos = user_assets do bucket onde paused = False
explicit = [a for a in ativos if a.target_pct is not None]
implicit = [a for a in ativos if a.target_pct is None]

soma_explicit = sum(a.target_pct for a in explicit)   # fração do bucket
sobra_pct = max(0, 1 - soma_explicit)

para cada a em explicit:
  target_value(a) = bucket_target_value * a.target_pct

se implicit:
  per_implicit = bucket_target_value * sobra_pct / len(implicit)
  target_value(a) = per_implicit  para cada a em implicit
```

Validação no momento da escrita: para cada `(user, bucket)`, soma de `target_pct` dos ativos **não-pausados** ≤ 1.0 (com epsilon `1e-4`). `0 ≤ target_pct ≤ 1` por ativo.

## Technical Considerations

### Modelo / Migração

- `backend/app/models/user_asset.py`: adicionar `target_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)`.
- Migração Alembic `018_add_target_pct_to_user_assets.py`:
  ```python
  op.add_column("user_assets",
      sa.Column("target_pct", sa.Numeric(5, 4), nullable=True))
  ```
- Backfill: nenhum. NULL = comportamento legado.

### Schema da API

- `backend/app/schemas/asset.py`: `AssetUpdate` ganha `target_pct: Optional[Decimal]` (opcional, com validador `0 ≤ x ≤ 1`). Resposta `_to_response` (assets.py:112) inclui `target_pct`.
- Sentinel para limpar valor: aceitar `target_pct: None` explícito via campo separado no JSON (FastAPI/Pydantic já distingue ausente vs. `null`). Alternativa simples: aceitar `-1` como "limpar". Recomendo o caminho Pydantic — usar `model_fields_set` na rota pra distinguir "não enviado" de "enviado como null".

### Endpoint

`PATCH /assets/{asset_id}` (`backend/app/routers/assets.py:505`) já trata `paused`. Estender:

```python
# em update_asset, após "if data.paused is not None: ..."
if "target_pct" in data.model_fields_set:
    user_asset.target_pct = data.target_pct  # pode ser None pra limpar
    await _validate_bucket_sum(db, user.id, asset)  # antes do commit
```

`_validate_bucket_sum`: dado o asset, resolve o bucket (`asset_bucket_for(...)`), soma `target_pct` dos UserAssets não-pausados do mesmo bucket considerando o novo valor proposto, e levanta `HTTPException(400)` se > 1.0 + epsilon.

A validação **também** roda quando `paused` muda de True → False (pois pode aumentar a soma do bucket). Roda em qualquer mutação de `paused` ou `target_pct`.

### Rebalancing Service

`backend/app/services/rebalancing_service.py:104-130` — substituir loop. Mudanças:

1. `_get_assets_with_values` precisa retornar também o `target_pct` do `UserAsset`. Estender o `AssetCandidate` tuple com mais um campo, ou trocar por dataclass:

```python
@dataclass
class AssetCandidate:
    ticker: str
    asset_class: AssetClass
    market: Market
    quote_currency: CurrencyCode
    allocation_bucket: AllocationBucket
    current_value: Decimal
    target_pct: Optional[Decimal]  # do user_asset
```

2. Loop por bucket vira:

```python
for bucket in candidate_buckets:
    assets_in_bucket = await self._get_assets_with_values(bucket)
    if not assets_in_bucket:
        continue
    bucket_target_value = investable_pos_aporte * targets.get(bucket, Decimal("0"))

    explicit = [a for a in assets_in_bucket if a.target_pct is not None]
    implicit = [a for a in assets_in_bucket if a.target_pct is None]
    sum_explicit = sum((a.target_pct for a in explicit), Decimal("0"))
    leftover_pct = max(Decimal("0"), Decimal("1") - sum_explicit)
    per_implicit = (bucket_target_value * leftover_pct / len(implicit)) if implicit else Decimal("0")

    bucket_candidates = []
    for a in assets_in_bucket:
        target_value = (bucket_target_value * a.target_pct) if a.target_pct is not None else per_implicit
        gap = target_value - a.current_value
        gap_pct = (gap / target_value * 100) if target_value else Decimal("0")
        if gap > 0:
            bucket_candidates.append((a, a.current_value, target_value, gap_pct))
    ...
```

3. Atenção: ativos pausados continuam excluídos via `UserAsset.paused == False` no query (já feito em `_get_assets_with_values`).

### Schemas / Tipos compartilhados

- `frontend/src/types/index.ts`: campo `target_pct?: number | null` em `Asset`.
- Conferir todo lugar que constroi `Asset` manualmente (regra de ouro do CLAUDE.md): grep por `as Asset`, `: Asset`, `Asset[]`.

### Frontend (catálogo)

`frontend/src/app/carteira/catalogo/page.tsx`:

- Cada linha de ativo ganha um input numérico "% alvo (auto)" ao lado do badge de bucket.
- Placeholder calcula peso igual implícito (`(1 - soma_explicit_no_bucket) / count_implicit_no_bucket * 100`).
- Validação local: bloquear submit se soma do bucket > 100%.
- Mostrar resumo por bucket: "Stocks BR: 75% explícito + 3 ativos auto (~8.3% cada)".
- Salvar via `apiFetch(/assets/${id}, PATCH, { target_pct: x })`. Botão "limpar" envia `target_pct: null`.

### Outras telas afetadas (read-only)

- `frontend/src/app/carteira/page.tsx` / componentes de tabela: opcionalmente mostrar coluna "Alvo (%)" usando o `target_pct` (ou "auto"). Marcar como nice-to-have, não bloqueador.
- `RebalancingTable` já mostra `target_value` por ativo — vai refletir os novos pesos automaticamente.

## System-Wide Impact

- **Interaction graph**: PATCH `/assets/{id}` → `update_asset` → `_validate_bucket_sum` (novo) → commit. `RebalancingService.calculate` → `_get_assets_with_values` (modificado) → cálculo por bucket (modificado). `SnapshotService` continua agregando por bucket — não é afetado.
- **Error propagation**: validação levanta `HTTPException(400)` antes do commit; transação não é parcialmente persistida. Frontend exibe mensagem ao usuário.
- **State lifecycle risks**: nenhum dado órfão. Pausar um ativo com `target_pct` definido **mantém** o valor (volta a aplicar quando despausado, com nova validação).
- **API surface parity**: única superfície é `PATCH /assets/{id}`. `POST /assets` (criação) **não** aceita `target_pct` — sempre nasce NULL (auto). Confirmar se há outro lugar que cria `UserAsset` (assets.py:280, 312, 497) — todos criam sem `target_pct`, ok.
- **Integration test scenarios**:
  1. Bucket com 2 ativos (50% / 50% explícito) + 1 implícito → implícito recebe 0%. Confirma `leftover_pct = 0`.
  2. Bucket com 1 ativo 30% explícito + 2 implícitos → implícitos recebem 35% cada.
  3. Soma 30% + 80% = 110% via PATCH → 400.
  4. Pausar ativo de 60% → soma cai pra 40%, despausar volta a 100% e ainda valida.
  5. Saved plan antigo (sem target_pct) recalculado → comportamento idêntico ao atual.

## Acceptance Criteria

- [x] Migração `018_add_target_pct_to_user_assets.py` aplica e reverte limpamente.
- [x] `UserAsset.target_pct` é `Optional[Decimal]`, nullable, default NULL.
- [x] `AssetUpdate` aceita `target_pct` opcional (incluindo `null` pra limpar).
- [x] `PATCH /assets/{id}` valida soma do bucket ≤ 100% (não-pausados) e retorna 400 com mensagem clara.
- [x] Validação dispara também quando `paused` muda de True → False.
- [x] `RebalancingService` aplica `target_pct` explícito; ativos sem `target_pct` dividem `(1 - sum_explicit)` igualmente.
- [x] Pausados são ignorados em `sum_explicit` e na contagem de implícitos.
- [x] Quando `sum_explicit == 1` e existe pelo menos 1 implícito, implícitos recebem 0 (sem erro).
- [x] `Asset` no `frontend/src/types/index.ts` inclui `target_pct?: number | null`.
- [x] Tela `/carteira/catalogo` permite editar `target_pct` por ativo, mostra soma por bucket e bloqueia submit > 100%.
- [ ] Testes unitários cobrem os 5 cenários de "Integration test scenarios". *(deferido — projeto não tem suite de testes ainda)*
- [x] Build local Docker passa (`docker compose -f docker-compose.yml -f docker-compose.prod.yml build`).

## Success Metrics

- Usuário consegue declarar pesos não-uniformes e o painel de rebalanceamento reflete corretamente os gaps.
- Zero regressão em rebalanceamento pra usuários que não setam nenhum `target_pct`.

## Dependencies & Risks

- **Risco baixo**: mudança aditiva (coluna nullable). Comportamento legado preservado quando NULL.
- **Risco médio**: bug no cálculo de `leftover_pct` quando `sum_explicit > 1` por race condition (validamos na escrita, mas se duas requisições concorrentes tocarem ativos do mesmo bucket simultaneamente podem driblar a validação). Mitigação: no `_validate_bucket_sum`, fazer `SELECT ... FOR UPDATE` nos UserAssets do bucket dentro da mesma transação. Como o app é single-user-per-session e os PATCHes são sequenciais na UI, é improvável — documentar como follow-up se aparecer.
- **Não esquentar com saved plans antigos** — confirmado pelo usuário. `SavedPlan` armazena snapshots de `asset_plan` em JSON; nada quebra.

## Sources & References

- Modelo bucket-level: `backend/app/models/allocation_target.py`
- Lógica atual de peso igual: `backend/app/services/rebalancing_service.py:104-130`
- Endpoint PATCH: `backend/app/routers/assets.py:505-563`
- Tela de catálogo: `frontend/src/app/carteira/catalogo/page.tsx`
- Tipos compartilhados: `frontend/src/types/index.ts`
- Migrações Alembic: `backend/alembic/versions/` (última: `017_add_retirement_goals.py`)
