---
title: "feat: Multi-Market Assets + ETFs in BR/USD/EUR/GBP with BRL-First Valuation"
type: feat
status: active
date: 2026-04-08
origin: manual-analysis
---

# feat: Multi-Market Assets + ETFs in BR/USD/EUR/GBP with BRL-First Valuation

## Overview

Adicionar suporte estrutural a ETFs e, por extensao, a ativos negociados em multiplos mercados e moedas, mantendo a premissa central do app:

- **O usuario pode registrar ativos de mercados diferentes**
- **O custo original da operacao e preservado**
- **Toda consolidacao, patrimonio, alocacao, rebalanceamento e historico continuam BRL-first**

O escopo funcional desejado neste plano e:

- ETFs do Brasil
- ETFs dos EUA
- ETFs cotados em EUR
- ETFs cotados em GBP
- Continuar suportando os ativos ja existentes
- Adicionar cotacoes FX para:
  - `USD/BRL`
  - `EUR/BRL`
  - `GBP/BRL`
- Postergar qualquer adaptacao de sync Bastter

Este plano parte da constatacao de que o modelo atual mistura em `AssetType` duas dimensoes diferentes:

- **classe do ativo**: acao, fii, renda fixa
- **mercado / moeda implícita**: `STOCK` hoje significa quase "ativo dos EUA em USD"

Para suportar ETFs em BR, USD, EUR e GBP sem remendos, o modelo precisa separar:

1. **o que o ativo e**
2. **onde ele negocia**
3. **em que moeda ele e cotado / negociado**

## Problem Statement / Motivation

O modelo atual nao comporta bem a expansao para ETFs internacionais porque:

1. `AssetType` e um enum hibrido e hoje nao separa corretamente classe vs mercado.
2. A regra de moeda da compra esta acoplada a `AssetType.STOCK`.
3. O servico de preco decide a fonte e a conversao para BRL apenas com base em `STOCK` vs `ACAO/FII`.
4. O frontend possui varios fluxos com listas fechadas de tipos (`STOCK`, `ACAO`, `FII`, `RF`).
5. O rebalanceamento e o catalogo assumem um numero fixo de classes.
6. O app ainda nao tem uma camada formal de FX multiplo; apenas `USD/BRL`.

Se apenas adicionarmos `ETF` ao enum atual, surgem ambiguidades:

- ETF seria sempre Brasil?
- ETF seria sempre exterior?
- ETF em EUR e GBP usaria qual regra de compra?
- ETF entraria em qual pagina, qual label e qual calculo?

Isso geraria regras especiais espalhadas por backend e frontend, elevando a chance de regressao e tornando futuras expansoes mais caras.

## Goals

- Separar estruturalmente **classe**, **mercado** e **moeda de negociacao**.
- Manter o app como **BRL-first**, com todos os agregados consolidados em BRL.
- Preservar custo original de compra por operacao na moeda nativa.
- Permitir que o usuario registre, visualize e rebalanceie ETFs em BR/USD/EUR/GBP.
- Preparar o sistema para suportar outros ativos internacionais no futuro sem nova remodelagem.

## Non-Goals

- Integracao Bastter nesta fase.
- Suporte imediato a corretagem, taxas, impostos e withholding por mercado.
- Multi-currency cash ledger.
- Conversao historica perfeita por intraday; o plano usa fechamento / ultima cotacao disponivel.
- Reclassificacao automatica de ativos existentes via provedor externo de metadata.

## Core Design Decision

### Decisao principal

Substituir o papel atual de `AssetType` como fonte unica de verdade por um modelo composto:

- `asset_class`: classe economica / de produto
- `market`: mercado / regiao operacional
- `quote_currency`: moeda de cotacao do ativo

### Modelo alvo

#### Dimensoes principais

- `asset_class`
  - `STOCK`
  - `ETF`
  - `FII`
  - `RF`
- `market`
  - `BR`
  - `US`
  - `EU`
  - `UK`
- `quote_currency`
  - `BRL`
  - `USD`
  - `EUR`
  - `GBP`

### Racional

- `STOCK` volta a significar "acao" e deixa de implicar EUA.
- `ETF` passa a ser classe propria.
- `market` define regras de integracao, ticker mapping e eventualmente fonte de dados.
- `quote_currency` define como converter custo e mercado para BRL.
- O app continua consolidando tudo em BRL, mas deixa de assumir que isso vem apenas de `USD/BRL`.

## Proposed Domain Model

### Tabela `assets`

#### Estado atual

Hoje `assets` tem, de forma relevante:

- `ticker`
- `type`
- `description`
- `current_price`
- `price_updated_at`

#### Estado proposto

Adicionar:

- `asset_class` enum
- `market` enum
- `quote_currency` enum
- opcional: `price_symbol` string nullable
- opcional: `is_active` bool default true

Manter por enquanto:

- `ticker`
- `description`
- `current_price`
- `price_updated_at`

### Por que manter `current_price` em BRL

O sistema atual ja usa `current_price` como valor consolidado para:

- patrimonio
- positions
- overview
- snapshots
- rebalanceamento

Para minimizar impacto transversal, a estrategia recomendada e:

- manter `assets.current_price` como **preco consolidado em BRL**
- adicionar campos auxiliares para debug / auditoria:
  - `current_price_native`
  - `price_currency`
  - `fx_rate_to_brl`

#### Recomendacao

Adicionar estes campos:

- `current_price_native DECIMAL(18,6) nullable`
- `price_currency enum nullable`
- `fx_rate_to_brl DECIMAL(18,6) nullable`

Assim:

- `current_price` continua sendo o preco consolidado em BRL
- `current_price_native` guarda o preco no mercado original
- `fx_rate_to_brl` guarda a taxa usada na ultima consolidacao

Isso reduz regressao porque a maior parte dos calculos atuais pode continuar multiplicando `qty * current_price`.

### Tabela `purchases`

#### Estado atual

Ja existe uma boa base:

- `trade_currency`
- `unit_price`
- `total_value`
- `unit_price_native`
- `total_value_native`
- `fx_rate`

Hoje, na pratica:

- `unit_price` / `total_value` sao BRL
- `*_native` sao moeda da operacao
- `fx_rate` funciona bem para USD

#### Estado proposto

Manter essa estrutura e formalizar semanticamente:

- `trade_currency`: moeda original da operacao
- `unit_price_native`: preco unitario na moeda original
- `total_value_native`: total na moeda original
- `fx_rate`: taxa `trade_currency -> BRL`
- `unit_price`: preco unitario consolidado em BRL
- `total_value`: total consolidado em BRL

#### Beneficio

`purchases` ja esta quase pronta para EUR e GBP. O problema atual nao e schema de compra, e sim a validacao / UI / pricing service.

### Tabela de FX / system settings

#### Problema atual

Hoje existe logica ad hoc para `usd_brl_rate` em `system_settings`.

#### Estado proposto

Substituir o tratamento especial de USD por uma estrutura generica de taxas:

Opcoes:

1. **Baixo atrito**
   - continuar usando `system_settings`
   - chaves:
     - `usd_brl_rate`
     - `usd_brl_rate_updated_at`
     - `eur_brl_rate`
     - `eur_brl_rate_updated_at`
     - `gbp_brl_rate`
     - `gbp_brl_rate_updated_at`

2. **Mais limpo**
   - criar tabela `fx_rates`

```text
fx_rates
- id
- base_currency
- quote_currency
- rate
- rate_date
- source
- fetched_at
- unique(base_currency, quote_currency, rate_date)
```

#### Recomendacao

Para o estado atual do projeto, a melhor opcao e:

- **curto prazo**: continuar em `system_settings` para nao abrir mais uma superficie de mudanca do que o necessario
- **medio prazo**: migrar para `fx_rates` quando houver demanda por historico FX persistido e auditoria mais forte

## Asset Taxonomy Proposal

### Classes suportadas

```text
asset_class
- STOCK
- ETF
- FII
- RF
```

### Mercados suportados no MVP estrutural

```text
market
- BR
- US
- EU
- UK
```

### Currency matrix recomendada

| asset_class | market | quote_currency | permitido no MVP |
|-------------|--------|----------------|------------------|
| STOCK | BR | BRL | sim |
| STOCK | US | USD | sim |
| ETF | BR | BRL | sim |
| ETF | US | USD | sim |
| ETF | EU | EUR | sim |
| ETF | UK | GBP | sim |
| FII | BR | BRL | sim |
| RF | BR | BRL | sim |

### Regras de validacao

- `RF` so pode existir com `market=BR` e `quote_currency=BRL`
- `FII` so pode existir com `market=BR` e `quote_currency=BRL`
- `STOCK/BR` exige `quote_currency=BRL`
- `STOCK/US` exige `quote_currency=USD`
- `ETF/BR` exige `quote_currency=BRL`
- `ETF/US` exige `quote_currency=USD`
- `ETF/EU` exige `quote_currency=EUR`
- `ETF/UK` exige `quote_currency=GBP`

Essas restricoes devem existir no backend, nao apenas no frontend.

## UX / Product Decisions

### Como o usuario deve ver os ativos

Como o app e BRL-first, a UI deve mostrar:

- valor consolidado em BRL como principal
- moeda nativa como contexto secundario quando aplicavel

### Posições

Exemplo para ETF em EUR:

- Valor de mercado: `R$ 12.345,67`
- Preco atual: `EUR 54,32`
- FX usado: `EUR/BRL 6,18`

### Compras

Ao registrar uma compra internacional:

- usuario escolhe o ativo
- o formulario detecta a moeda nativa do ativo
- o valor principal digitado passa a ser na moeda da operacao
- a UI mostra a conversao estimada para BRL usando a taxa atual
- no submit o backend persiste ambos os valores

### Navegacao

Este plano recomenda abandonar a segmentacao atual baseada apenas em tipos historicos (`stocks`, `acoes`, `fiis`) e migrar para uma navegacao mais aderente ao novo modelo:

#### Opcao recomendada

Grupo Ativos:

- Catalogo
- Acoes Brasil
- Acoes Exterior
- ETFs
- FIIs
- Renda Fixa

#### Detalhe para ETFs

A pagina de ETFs pode ter subfiltros / tabs:

- Todos
- Brasil
- EUA
- Europa
- Reino Unido

#### Alternativa mais barata

Manter paginas atuais e adicionar:

- `/carteira/etfs`

Com filtros internos por mercado.

#### Recomendacao

Para reduzir rework agora:

- adicionar pagina unica `/carteira/etfs`
- manter `acoes` dividida em Brasil e EUA por compatibilidade visual existente
- revisar a IA da navegacao em fase posterior

## Technical Approach

### Arquitetura conceitual

```text
Asset metadata
  -> define class + market + quote_currency + price symbol

PriceService
  -> busca cotacao nativa do ativo
  -> busca FX para BRL se necessario
  -> grava preco nativo + preco BRL consolidado

Purchase flow
  -> usa quote_currency do ativo
  -> exige valores na moeda correta
  -> calcula BRL via fx_rate

Portfolio / snapshots / rebalancing
  -> continuam usando valores em BRL
  -> exibem contexto nativo como informacao complementar
```

## Detailed Implementation Plan

## Fase 0: Foundations / Terminology Freeze

### Objetivo

Fechar a nomenclatura antes de tocar o schema, para evitar rename em cascata no meio da implementacao.

### Decisoes a fixar

- `AssetType` atual sera substituido por `AssetClass`?
- `market` vai representar regiao (`EU`) ou exchange especifica (`XETRA`, `LSE`)?
- `quote_currency` sera sempre derivado do mercado ou um campo explicito?

### Recomendacao final

- renomear conceitualmente para `AssetClass`
- usar `market` em nivel de regiao nesta fase:
  - `BR`
  - `US`
  - `EU`
  - `UK`
- manter `quote_currency` explicito, mesmo quando derivavel

### Motivo

- evita inferencia escondida
- deixa o modelo preparado para futuros casos em que um mesmo mercado possa listar ativos em moedas diferentes

## Fase 1: Backend Domain Refactor

### Arquivos principais

- `backend/app/models/asset.py`
- `backend/app/schemas/asset.py`
- `backend/app/schemas/purchase.py`
- `backend/app/schemas/portfolio.py`
- `backend/app/schemas/rebalancing.py`
- `backend/app/schemas/snapshot.py`
- `backend/app/constants.py`
- `frontend/src/types/index.ts`

### Mudancas de modelo

Criar enums novos:

- `AssetClass`
- `Market`
- `CurrencyCode`

#### Exemplo conceitual

```python
class AssetClass(str, PyEnum):
    STOCK = "STOCK"
    ETF = "ETF"
    FII = "FII"
    RF = "RF"

class Market(str, PyEnum):
    BR = "BR"
    US = "US"
    EU = "EU"
    UK = "UK"

class CurrencyCode(str, PyEnum):
    BRL = "BRL"
    USD = "USD"
    EUR = "EUR"
    GBP = "GBP"
```

### Asset model proposto

Campos:

- `asset_class`
- `market`
- `quote_currency`
- `current_price` BRL
- `current_price_native`
- `fx_rate_to_brl`
- `price_updated_at`

### Compatibilidade

Durante a transicao, existem duas estrategias:

1. **Big bang**
   - remover `type`
   - substituir tudo de uma vez

2. **Transicao controlada**
   - adicionar novos campos
   - popular a partir de `type`
   - migrar o codigo
   - remover `type` numa migration posterior

### Recomendacao

Usar **transicao controlada**.

Motivo:

- o projeto tem varios pontos hardcoded
- reduz risco de quebrar rotas existentes no meio da entrega
- permite migrar backend e frontend em etapas menores

## Fase 2: Database Migrations

### Migration 1: Expand schema

Adicionar em `assets`:

- `asset_class`
- `market`
- `quote_currency`
- `current_price_native`
- `fx_rate_to_brl`

Adicionar em `allocation_targets`:

- trocar conceito de `asset_class` atual para o novo enum com `ETF`

### Backfill de ativos existentes

Mapeamento inicial:

| type atual | asset_class novo | market | quote_currency |
|-----------|------------------|--------|----------------|
| STOCK | STOCK | US | USD |
| ACAO | STOCK | BR | BRL |
| FII | FII | BR | BRL |
| RF | RF | BR | BRL |

### Impacto importante

`ACAO` deixa de existir como classe distinta. Ele vira:

- `asset_class=STOCK`
- `market=BR`

Esse e um ponto importante de produto e de analytics.

#### Consequencia

Se o app hoje trata "Acoes (Brasil)" como categoria de alocacao independente de "Stocks (EUA)", voce precisa decidir:

1. **Metas por asset_class pura**
   - `STOCK`, `ETF`, `FII`, `RF`
   - BR e exterior somam dentro de `STOCK`

2. **Metas por bucket de alocacao**
   - `STOCK_BR`
   - `STOCK_US`
   - `ETF`
   - `FII`
   - `RF`

### Decisao necessaria

Para nao perder o comportamento atual de separacao Brasil/EUA, o mais seguro e **nao usar `asset_class` diretamente para alocacao**.

Em vez disso, criar um novo conceito:

- `allocation_bucket`

#### Buckets recomendados

- `STOCK_BR`
- `STOCK_US`
- `ETF_BR`
- `ETF_INTL`
- `FII`
- `RF`

Ou, se quiser mais granularidade internacional:

- `STOCK_BR`
- `STOCK_US`
- `ETF_BR`
- `ETF_US`
- `ETF_EU`
- `ETF_UK`
- `FII`
- `RF`

### Recomendacao final para alocacao

Usar:

- `STOCK_BR`
- `STOCK_US`
- `ETF_BR`
- `ETF_INTL`
- `FII`
- `RF`

Motivo:

- preserva separacao Brasil vs exterior onde isso importa
- evita explodir o numero de metas com granularidade excessiva
- continua simples de explicar para o usuario

### Migration 2: Allocation targets

Criar / migrar tabela de metas para usar `allocation_bucket` em vez de enum antigo.

Backfill proposto:

| meta atual | bucket novo |
|-----------|-------------|
| ACAO | STOCK_BR |
| STOCK | STOCK_US |
| FII | FII |
| RF | RF |

Bucktes novos entram zerados:

- `ETF_BR`
- `ETF_INTL`

### Migration 3: Remove legacy type

Somente depois que backend e frontend estiverem migrados:

- remover `assets.type`
- remover referencias a `ACAO` do codigo

## Fase 3: Allocation Model Refactor

### Problema central

O sistema atual usa `AssetType` tambem para:

- breakdown de overview
- targets
- rebalanceamento
- labels
- snapshot allocation

Com a nova estrutura, isso deixa de ser correto.

### Solucao

Introduzir um enum especifico para alocacao:

- `AllocationBucket`

#### Proposta

```text
AllocationBucket
- STOCK_BR
- STOCK_US
- ETF_BR
- ETF_INTL
- FII
- RF
```

### Regra de derivacao

Cada ativo precisa mapear deterministicamente para um bucket.

#### Função de mapeamento

```text
if asset_class == RF -> RF
if asset_class == FII -> FII
if asset_class == STOCK and market == BR -> STOCK_BR
if asset_class == STOCK and market != BR -> STOCK_US
if asset_class == ETF and market == BR -> ETF_BR
if asset_class == ETF and market in {US, EU, UK} -> ETF_INTL
```

### Onde usar bucket

- targets do usuario
- allocation breakdown
- rebalanceamento
- graficos de distribuicao
- cards resumo
- snapshots mensais e diarios

### Onde usar class + market

- catalogo
- filtros de pagina
- formularios de ativo
- logos
- pagina de posicoes
- importacao CSV

## Fase 4: FX Layer

### Objetivo

Generalizar o suporte a moeda para qualquer ativo com cotacao nao-BRL.

### Taxas necessarias

- `USD/BRL`
- `EUR/BRL`
- `GBP/BRL`

### Interface recomendada

Criar um servico pequeno, independente de `PriceService`, por exemplo:

- `backend/app/services/fx_service.py`

Responsabilidades:

- buscar taxas correntes
- persistir cache
- retornar taxa para uma moeda especifica
- retornar timestamp da ultima atualizacao

### API interna sugerida

```python
await fx_service.get_rate_to_brl(CurrencyCode.USD)
await fx_service.get_rate_to_brl(CurrencyCode.EUR)
await fx_service.get_rate_to_brl(CurrencyCode.GBP)
await fx_service.refresh_all_rates()
```

### Regras

- `BRL -> BRL = 1`
- `USD/EUR/GBP -> BRL` obrigatorios para consolidacao
- se uma taxa estiver indisponivel:
  - nao atualizar preco consolidado do ativo
  - registrar erro por ativo / moeda
  - manter ultimo valor valido quando apropriado

### Precos historicos

Para snapshots passados, a qualidade ideal e:

- buscar preco historico nativo do ativo
- buscar FX historico da moeda para BRL na mesma data
- converter ambos

### Realidade do MVP

O sistema atual ja busca historico com fallback de poucos dias.

Recomendacao:

- replicar a mesma abordagem para EUR/GBP
- se nao houver FX historico, usar a ultima taxa conhecida e marcar internamente como fallback

## Fase 5: Price Service Refactor

### Objetivo

Parar de decidir precificacao por `AssetType` hardcoded e passar a decidir por metadata do ativo.

### Estado atual

O servico atual faz:

- `STOCK` -> yfinance, converte via `USD/BRL`
- `ACAO/FII` -> yfinance com `.SA`, sem FX

### Estado proposto

Cada ativo precisa fornecer:

- ticker de exibicao
- symbol usado pelo provedor de preco
- moeda nativa
- regra de sufixo / mercado

### Processo novo de atualizacao

Para cada ativo:

1. resolver symbol de preco
2. buscar preco nativo
3. descobrir `quote_currency`
4. se moeda != BRL, buscar FX correspondente
5. salvar:
   - `current_price_native`
   - `fx_rate_to_brl`
   - `current_price` em BRL
   - `price_updated_at`

### Possivel campo novo

Adicionar `price_symbol` em `assets` para nao depender sempre de heuristica por ticker.

#### Exemplo

- ETF Brasil: `BOVA11.SA`
- ETF EUA: `VOO`
- ETF Europa: pode exigir symbol diferente conforme provedor
- ETF UK: pode exigir symbol da bolsa correspondente

### Recomendacao

Adicionar `price_symbol nullable`.

Uso:

- se preenchido, usar diretamente
- se vazio, derivar heuristica

### Beneficio

ETFs internacionais, especialmente EUR/GBP, podem ter simbolos que nao se encaixam numa regra simples tipo `.SA`.

## Fase 6: Purchase Flow Refactor

### Objetivo

Fazer a compra usar `quote_currency` do ativo, nao `asset_type`.

### Regra nova

Ao criar compra:

- `trade_currency` default = `asset.quote_currency`
- usuario nao deve poder registrar compra em moeda incoerente com o ativo neste MVP

#### Exemplo

- ETF BR -> BRL
- ETF US -> USD
- ETF EU -> EUR
- ETF UK -> GBP

### Validacao backend

Substituir:

- "USD apenas para STOCK"

Por:

- "trade_currency deve ser igual a asset.quote_currency"

### Calculo

Se `trade_currency == BRL`:

- `fx_rate = 1`

Se `trade_currency != BRL`:

- `fx_rate` obrigatorio
- `unit_price = unit_price_native * fx_rate`
- `total_value = total_value_native * fx_rate`

### Endpoint de contexto de FX

Hoje existe endpoint voltado a USD.

Proposta:

- responder um mapa de taxas disponiveis

```json
{
  "rates_to_brl": {
    "USD": 5.42,
    "EUR": 6.18,
    "GBP": 7.21,
    "BRL": 1
  },
  "updated_at": {
    "USD": "...",
    "EUR": "...",
    "GBP": "..."
  }
}
```

### UX do formulario

Ao selecionar ativo:

- mostrar label do campo de valor na moeda correta
- mostrar conversao para BRL se moeda != BRL
- remover a associacao visual antiga de "internacional = stock"

## Fase 7: Portfolio, Overview and Positions

### Objetivo

Preservar consolidacao BRL, mas exibir melhor contexto de classe / mercado / moeda.

### Positions endpoint

Hoje `GET /portfolio/{asset_class}` usa o enum antigo e tem um ramo especial para RF.

### Estado proposto

Separar o problema em dois eixos:

1. bucket de alocacao
2. filtros de exploracao

#### Endpoints recomendados

- `GET /portfolio/positions`
  - filtros opcionais:
    - `asset_class`
    - `market`
    - `allocation_bucket`
- `GET /portfolio/allocation`
  - breakdown por `AllocationBucket`
- `GET /portfolio/overview`
  - continua consolidando em BRL

### Beneficio

Evita proliferar rotas acopladas ao enum.

### Compatibilidade

Pode-se manter temporariamente:

- `/portfolio/STOCK`
- `/portfolio/ACAO`
- `/portfolio/FII`
- `/portfolio/RF`

Mas internamente elas devem ser adaptadores para a nova camada.

### Recomendacao

Se o objetivo e fazer a feature sem quebrar toda a navegacao:

- manter endpoints legados por compatibilidade
- criar endpoint novo mais flexivel
- migrar frontend para o endpoint novo
- remover legado depois

## Fase 8: Rebalancing Refactor

### Objetivo

Permitir metas coerentes com o novo universo de ativos.

### Problema atual

O rebalanceamento:

- itera em `AssetType`
- escolhe candidatos apenas de `STOCK`, `ACAO`, `FII`

Isso nao funciona para ETFs e continua preso ao enum antigo.

### Nova base conceitual

Rebalanceamento passa a operar em:

- `AllocationBucket`

### Fluxo novo

1. calcular valor atual por bucket
2. carregar metas por bucket
3. calcular gap por bucket
4. dentro de cada bucket, buscar ativos elegiveis
5. distribuir aporte entre ativos do bucket

### Regras de bucket

- `RF` continua bucket proprio
- `FII` continua bucket proprio
- ETFs brasileiros e internacionais podem ter metas separadas

### Regras por ativo

Ativos pausados continuam excluidos.

Ativos internacionais entram normalmente no plano:

- valor atual em BRL
- target em BRL
- amount_to_invest em BRL
- opcionalmente `amount_to_invest_native` na moeda do ativo

### Recomendacao de UX

Para ativos internacionais no planejador:

- sempre mostrar `amount_to_invest` em BRL
- mostrar `amount_to_invest_native` como complemento

Exemplo:

- Aportar: `R$ 2.000,00`
- Equivale a: `EUR 323,52`

## Fase 9: Snapshots and Historical Valuation

### Objetivo

Garantir que snapshots mensais e diarios continuem corretos com multi-currency.

### Mudancas necessarias

- historico de preco precisa considerar moeda nativa do ativo
- historico FX precisa considerar `USD`, `EUR`, `GBP`
- allocation snapshot passa a usar `AllocationBucket`

### Dados gravados

Em cada snapshot de ativo, e util guardar:

- ticker
- asset_class
- market
- quote_currency
- quantity
- avg_price_brl
- avg_price_native
- closing_price_native
- fx_rate_to_brl
- closing_price_brl
- market_value_brl

### Motivo

Isso melhora rastreabilidade e evita que o usuario perca contexto de porque um ativo em EUR teve determinado valor em BRL.

## Fase 10: Frontend Type System and API Contracts

### Tipos novos

No frontend, introduzir:

- `AssetClass`
- `Market`
- `CurrencyCode`
- `AllocationBucket`

### Atualizar interfaces

- `Asset`
- `PositionItem`
- `ClassSummary`
- `AllocationTarget`
- `AssetRebalancing`
- `Purchase`
- `SnapshotAssetItem`

### Campos recomendados no frontend

Para `Asset`:

- `asset_class`
- `market`
- `quote_currency`
- `current_price`
- `current_price_native`
- `fx_rate_to_brl`

Para `PositionItem`:

- `asset_class`
- `market`
- `quote_currency`
- `current_price_native`
- `fx_rate_to_brl`
- `market_value` em BRL

## Fase 11: Frontend Screens and Navigation

### Catalogo

O catalogo precisa permitir criar ativos com os novos campos:

- ticker
- classe
- mercado
- moeda
- symbol de preco opcional
- descricao

### Regras do formulario

Ao escolher classe e mercado:

- a moeda pode ser sugerida automaticamente
- mas deve refletir a regra validada no backend

Exemplos:

- `ETF + BR` -> `BRL`
- `ETF + EU` -> `EUR`
- `ETF + UK` -> `GBP`

### Purchase form

O formulario de compra precisa:

- agrupar ativos por label mais rica
- exibir classe + mercado
- trocar labels do campo monetario conforme moeda

Exemplo de dropdown:

- `BOVA11 · ETF · Brasil · BRL`
- `VOO · ETF · EUA · USD`
- `VWCE · ETF · Europa · EUR`
- `VUKG · ETF · Reino Unido · GBP`

### Sidebar / paginas

#### Opcao recomendada para MVP

Adicionar:

- `/carteira/etfs`

Com tabs / filtros por mercado:

- Todos
- Brasil
- EUA
- Europa
- Reino Unido

#### Manter:

- `/carteira/acoes`
- `/carteira/stocks`
- `/carteira/fiis`
- `/carteira/renda-fixa`

#### Nota

Mesmo mantendo `/carteira/stocks`, internamente ele passa a significar algo como:

- `asset_class=STOCK`
- `market=US`

No medio prazo convem renomear para algo mais consistente, mas nao e bloqueador.

## Fase 12: CSV / Bulk Import / Seeds

### CSV import

O importador atual aceita apenas `ticker,tipo`.

Com o novo modelo isso fica insuficiente.

### Novo formato recomendado

```text
ticker,asset_class,market,quote_currency,price_symbol
VOO,ETF,US,USD,VOO
BOVA11,ETF,BR,BRL,BOVA11.SA
VWCE,ETF,EU,EUR,VWCE
VUKG,ETF,UK,GBP,VUKG
```

### Regras

- `price_symbol` opcional mas fortemente recomendado para ativos internacionais
- quando omitido, backend tenta derivar

### Seeds / demo data

Adicionar exemplos reais de:

- 1 ETF BR
- 1 ETF US
- 1 ETF EU
- 1 ETF UK

Para validar ponta a ponta:

- catalogo
- compra
- price refresh
- overview
- rebalanceamento
- snapshot

## Fase 13: Backward Compatibility Strategy

### Problema

Ha muito codigo hoje que ainda referencia:

- `ACAO`
- `STOCK`
- `FII`
- `RF`

### Estrategia recomendada

Executar a migracao em duas ondas.

#### Onda A: schema expandido + adaptadores

- adicionar novos campos e enums
- manter `type` legado
- endpoints retornam ambos quando necessario
- frontend comeca a migrar

#### Onda B: limpeza

- remover `type`
- remover `ACAO` como classe
- remover paginas / endpoints legados que nao fazem mais sentido

### Beneficio

- reduz risco de deploy quebrado
- permite testes incrementais

## Fase 14: Testing Strategy

### Backend tests

Cobrir no minimo:

- criacao de ativo com combinacoes validas e invalidas de class/market/currency
- compra BRL
- compra USD
- compra EUR
- compra GBP
- atualizacao de precos com FX multiplo
- falha de preco nativo
- falha de FX
- overview consolidado em BRL
- positions de ETFs por mercado
- rebalanceamento com buckets novos
- snapshots historicos com FX

### Frontend tests / smoke checks

- catalogo cria ETF BR/US/EU/UK
- purchase form muda label monetario corretamente
- pagina de ETFs filtra por mercado
- overview mostra patrimonio consolidado sem quebrar
- planner exibe buckets novos

### Casos de regressao critica

- ativos antigos continuam aparecendo corretamente
- purchases antigas continuam com valores BRL consistentes
- RF nao quebra
- FII nao quebra
- importacao CSV antiga falha com mensagem clara ou e migrada explicitamente

## Risks

### 1. Misturar classe e bucket novamente

Se `asset_class` e `allocation_bucket` nao forem separados desde o inicio, a feature vai voltar a ficar inconsistente.

### 2. Simbolo de preco internacional

ETFs em EUR/GBP podem ter symbols e bolsas com convencoes diferentes. Sem `price_symbol`, o sistema pode falhar em varios casos.

### 3. Snapshot historico com FX

Se o historico FX for instavel ou tiver fallback demais, snapshots podem ficar corretos estruturalmente, mas fracos em precisao historica.

### 4. Scope creep de internacionalizacao

O modelo novo abre porta para mais mercados. O risco e tentar suportar tudo de uma vez. Este plano deve ficar restrito a:

- BR
- US
- EU
- UK
- BRL/USD/EUR/GBP

### 5. UI excessivamente tecnica

Se a tela expuser classe, mercado, bucket, moeda e symbol sem boa hierarquia visual, o usuario perde clareza.

## Rollout Strategy

### Etapa 1

Schema expandido + backend adaptado sem exposicao total na UI.

### Etapa 2

Catalogo e compra suportam ativos novos.

### Etapa 3

Overview, posicoes e planner usam buckets novos.

### Etapa 4

Snapshots historicos e limpeza de legado.

### Etapa 5

Remocao de `type` legado.

## Acceptance Criteria

- [ ] Backend aceita ativos com `asset_class`, `market` e `quote_currency`
- [ ] ETFs podem ser cadastrados para BR, US, EU e UK
- [ ] Compra de ativo usa a moeda correta do proprio ativo
- [ ] `USD/BRL`, `EUR/BRL` e `GBP/BRL` sao buscados e cacheados
- [ ] Todos os valores consolidados de patrimonio continuam em BRL
- [ ] Positions exibem contexto de moeda nativa quando aplicavel
- [ ] Overview calcula alocacao em BRL sem regressao
- [ ] Rebalanceamento opera por `AllocationBucket`
- [ ] Buckets de ETF existem e podem ter metas dedicadas
- [ ] Snapshots historicos suportam ativos em USD/EUR/GBP
- [ ] Catalogo frontend permite criar ETFs multi-mercado
- [ ] Purchase form suporta BRL/USD/EUR/GBP sem regras hardcoded por tipo legado
- [ ] Pagina `/carteira/etfs` existe e permite filtro por mercado
- [ ] Sync Bastter permanece isolado e nao bloqueia a feature

## Suggested File Impact Map

### Backend

- `backend/app/models/asset.py`
- `backend/app/models/allocation_target.py`
- `backend/app/schemas/asset.py`
- `backend/app/schemas/purchase.py`
- `backend/app/schemas/portfolio.py`
- `backend/app/schemas/allocation.py`
- `backend/app/schemas/rebalancing.py`
- `backend/app/schemas/snapshot.py`
- `backend/app/routers/assets.py`
- `backend/app/routers/purchases.py`
- `backend/app/routers/portfolio.py`
- `backend/app/routers/allocation.py`
- `backend/app/routers/prices.py`
- `backend/app/services/price_service.py`
- `backend/app/services/portfolio_service.py`
- `backend/app/services/rebalancing_service.py`
- `backend/app/services/snapshot_service.py`
- `backend/app/constants.py`
- `backend/alembic/versions/...`

### Frontend

- `frontend/src/types/index.ts`
- `frontend/src/components/asset-form.tsx`
- `frontend/src/components/purchase-form.tsx`
- `frontend/src/components/asset-list-page.tsx`
- `frontend/src/components/positions-table.tsx`
- `frontend/src/components/month-transactions.tsx`
- `frontend/src/components/detail-drawer.tsx`
- `frontend/src/components/csv-import-modal.tsx`
- `frontend/src/components/sidebar.tsx`
- `frontend/src/components/ticker-logo.tsx`
- `frontend/src/app/carteira/catalogo/page.tsx`
- `frontend/src/app/carteira/etfs/page.tsx`
- `frontend/src/app/carteira/stocks/page.tsx`
- `frontend/src/app/carteira/acoes/page.tsx`
- `frontend/src/app/desejados/page.tsx`

## Recommended Delivery Sequence

1. Introduzir enums novos e expandir schema sem remover legado.
2. Introduzir `AllocationBucket` e migrar metas.
3. Criar camada de FX multiplo.
4. Refatorar `PriceService`.
5. Refatorar `Purchase` para moeda por ativo.
6. Adaptar overview / positions / snapshots.
7. Adaptar planner / rebalanceamento.
8. Adaptar catalogo, CSV e purchase form.
9. Adicionar pagina `/carteira/etfs`.
10. Remover legado (`type`, `ACAO`) somente no fim.

## Sources & References

- Analise local do codigo em:
  - `backend/app/models/asset.py`
  - `backend/app/services/price_service.py`
  - `backend/app/routers/purchases.py`
  - `backend/app/routers/portfolio.py`
  - `backend/app/services/rebalancing_service.py`
  - `frontend/src/types/index.ts`
  - `frontend/src/components/purchase-form.tsx`
  - `frontend/src/components/csv-import-modal.tsx`
  - `frontend/src/components/sidebar.tsx`
- Planos relacionados:
  - `docs/plans/2026-03-18-feat-carteira-investimentos-fullstack-app-plan.md`
  - `docs/plans/2026-03-19-feat-asset-catalog-reorganization-plan.md`
  - `docs/plans/2026-03-23-feat-user-scoped-assets-plan.md`
