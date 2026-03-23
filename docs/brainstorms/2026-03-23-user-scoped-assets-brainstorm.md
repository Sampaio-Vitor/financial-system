# Brainstorm: Ativos com Escopo por Usuario + Exclusao de Ativos

**Data:** 2026-03-23
**Status:** Concluido

## O Que Estamos Construindo

Duas mudancas relacionadas no sistema de ativos:

1. **Catalogo por usuario:** Hoje todos os usuarios compartilham o mesmo catalogo de ativos. Cada usuario deve ver apenas os ativos que ele adicionou/rastreia, sem afetar outros usuarios.

2. **Exclusao de ativos:** Permitir que um usuario remova um ativo do seu catalogo, desde que sua posicao naquele ativo esteja zerada (sem dinheiro alocado).

## Por Que Esta Abordagem

### Catalogo Global + Tabela de Vinculo (user_assets)

A tabela `assets` continua sendo um catalogo global compartilhado (evita duplicar dados de preco, ticker, etc.). Uma nova tabela intermediaria `user_assets` vincula cada usuario aos ativos que ele rastreia.

**Vantagens:**
- Preco e dados do ativo ficam centralizados (uma unica fonte de verdade)
- Servico de precos continua funcionando sem mudanca (atualiza todos os ativos de uma vez)
- Nao duplica linhas para o mesmo ticker
- Cada usuario pode personalizar `paused` independentemente

**Alternativa descartada:** Adicionar `user_id` diretamente na tabela `assets` — duplicaria dados de preco e complicaria o servico de atualizacao de cotacoes.

### Exclusao como Desvinculacao

Excluir = remover a linha `user_assets`, nao deletar o ativo global nem as compras historicas.

**Regras:**
- So permite exclusao se a posicao do usuario naquele ativo for zero (sum(quantity) = 0)
- Compras historicas sao preservadas (historico de transacoes intacto)
- O ativo global continua existindo para outros usuarios

## Decisoes-Chave

| Decisao | Escolha | Justificativa |
|---------|---------|---------------|
| Isolamento de ativos | Catalogo global + filtro via `user_assets` | Evita duplicar dados de preco |
| Vinculo usuario-ativo | Tabela `user_assets` (user_id, asset_id) | Permite ter ativos no catalogo sem ter compras |
| Campo `paused` | Mover de `assets` para `user_assets` | Cada usuario pausa independentemente |
| Comportamento do delete | Remove vinculo `user_assets` apenas | Preserva historico e ativo global |
| Condicao para delete | Posicao atual = 0 (sum(quantity) = 0) | Nao permite excluir ativo com dinheiro alocado |
| Compras ao excluir | Preservadas | Historico de transacoes intacto |
| Migracao de dados | Auto-vincular por compras existentes | Para cada usuario, criar `user_assets` para ativos onde tem compras |

## Modelo de Dados Proposto

### Nova tabela: `user_assets`

```
user_assets
├── id (PK, autoincrement)
├── user_id (FK -> users.id, NOT NULL)
├── asset_id (FK -> assets.id, NOT NULL)
├── paused (BOOLEAN, default false)  -- movido de assets
├── created_at (DATETIME)
└── UNIQUE(user_id, asset_id)
```

### Alteracao na tabela `assets`

- Remover coluna `paused` (migra para `user_assets`)

## Impacto nos Endpoints

| Endpoint | Mudanca |
|----------|---------|
| `GET /assets` | Filtrar por `user_assets` do usuario autenticado |
| `POST /assets` | Criar ativo global (se nao existe) + criar vinculo `user_assets` |
| `PUT /assets/{id}` (paused) | Atualizar `paused` em `user_assets`, nao em `assets` |
| `DELETE /assets/{id}` (NOVO) | Verificar posicao = 0, remover `user_assets` |
| Servico de precos | Sem mudanca (continua atualizando todos os ativos globais) |
| `GET /portfolio/*` | Sem mudanca (ja filtra por `user_id` via purchases) |

## Questoes Resolvidas

- **E se dois usuarios adicionam o mesmo ticker?** Ambos vinculam ao mesmo ativo global. Cada um tem seu proprio `user_assets` com `paused` independente.
- **E se o usuario exclui um ativo e depois quer readiciona-lo?** Basta criar novo vinculo `user_assets`. Compras historicas continuam la.
- **Como fica o POST /assets para ativo que ja existe?** Se o ticker ja existe na tabela `assets`, apenas cria o vinculo `user_assets`. Se nao existe, cria o ativo global + vinculo.
