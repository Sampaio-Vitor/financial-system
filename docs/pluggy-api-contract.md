# Pluggy API — Contrato e Respostas Tipicas

Base URL: `https://api.pluggy.ai`

---

## Autenticacao

### POST /auth

```json
// Request
{ "clientId": "...", "clientSecret": "..." }

// Response
{ "apiKey": "eyJ..." }
```

O `apiKey` expira em 2h. Todas as chamadas seguintes usam header `X-API-KEY: {apiKey}`.

---

## Endpoints Utilizados

### POST /connect_token

Gera token de 30min para o widget Pluggy Connect.

```json
// Request
{ "clientUserId": "1" }
// ou para reconexao:
{ "clientUserId": "1", "itemId": "cfbf1377-..." }

// Response
{ "accessToken": "eyJ..." }
```

### GET /items/{itemId}

Status da conexao bancaria.

```json
{
  "id": "cfbf1377-3067-460c-9d24-5af1b18f795f",
  "status": "UPDATED",         // UPDATED | LOGIN_ERROR | OUTDATED | WAITING_USER_INPUT
  "executionStatus": "SUCCESS",
  "connector": { "id": 201, "name": "Nubank" },
  "createdAt": "2026-03-24T18:49:00.000Z",
  "updatedAt": "2026-03-24T19:02:00.000Z"
}
```

### GET /accounts?itemId={itemId}

Lista contas de um item.

```json
{
  "results": [
    {
      "id": "8baab610-5a25-4223-b3d3-21371597cc20",
      "type": "BANK",           // BANK | CREDIT | SAVINGS
      "name": "Conta Corrente",
      "balance": 1234.56,
      "currencyCode": "BRL",
      "itemId": "cfbf1377-..."
    }
  ]
}
```

Mapeamento de tipos: `BANK` → checking, `CREDIT` → credit_card, `SAVINGS` → savings.

### GET /transactions?accountId={accountId}&pageSize=500&page=1&from=2026-03-01

Paginado. Retorna ate `pageSize` transacoes por pagina.

```json
{
  "results": [ /* array de Transaction */ ],
  "page": 1,
  "total": 189,
  "totalPages": 1
}
```

---

## Transaction — Estrutura Completa

### Transferencia PIX para terceiro (Transfers)

```json
{
  "id": "75703b05-1f2e-436e-8b92-696e66051332",
  "date": "2026-03-23T03:00:00.000Z",
  "type": "DEBIT",
  "amount": -2631.50,
  "status": "POSTED",
  "balance": null,
  "category": "Transfers",
  "categoryId": "05000000",
  "merchant": null,
  "accountId": "8baab610-...",
  "description": "Transferência enviada|Thiago Silva Da Cruz Soares",
  "descriptionRaw": "Transferência enviada|Thiago Silva Da Cruz Soares",
  "operationType": "PIX",
  "currencyCode": "BRL",
  "paymentData": {
    "payer": {
      "name": null,
      "branchNumber": null,
      "accountNumber": null,
      "routingNumber": null,
      "documentNumber": { "type": "CPF", "value": "115.308.416-31" },
      "routingNumberISPB": null
    },
    "receiver": {
      "name": "Thiago Silva Da Cruz Soares",
      "branchNumber": "0001",
      "accountNumber": "08787027-4",
      "routingNumber": "336",
      "documentNumber": { "type": "CPF", "value": "133.797.856-60" },
      "routingNumberISPB": "31872495"
    },
    "paymentMethod": "PIX",
    "reason": null,
    "referenceNumber": null,
    "receiverReferenceId": null,
    "boletoMetadata": null
  },
  "acquirerData": null,
  "creditCardMetadata": null,
  "amountInAccountCurrency": null,
  "providerCode": null,
  "providerId": null,
  "createdAt": "2026-03-24T19:02:53.732Z",
  "updatedAt": "2026-03-24T19:02:53.732Z"
}
```

### Transferencia interna — mesma pessoa (Same person transfer)

Pluggy detecta automaticamente quando payer e receiver tem o mesmo CPF.

**Saida (DEBIT):**
```json
{
  "id": "8cbbdbc5-0234-4a91-be0c-e9ee44e86a54",
  "date": "2026-03-21T23:12:12.115Z",
  "type": "DEBIT",
  "amount": -267,
  "status": "POSTED",
  "category": "Same person transfer",
  "categoryId": "04000000",
  "description": "Transferência enviada|Vitor Carvalho Sampaio",
  "operationType": "PIX",
  "paymentData": {
    "payer": {
      "documentNumber": { "type": "CPF", "value": "115.308.416-31" }
    },
    "receiver": {
      "name": "Vitor Carvalho Sampaio",
      "branchNumber": "0001",
      "accountNumber": "9482885867-7",
      "routingNumber": "323",
      "documentNumber": { "type": "CPF", "value": "115.308.416-31" },
      "routingNumberISPB": "10573521"
    },
    "paymentMethod": "PIX"
  }
}
```

**Entrada (CREDIT):**
```json
{
  "id": "db691f46-b59b-4923-afbf-19c785b9181a",
  "date": "2026-03-23T12:19:35.879Z",
  "type": "CREDIT",
  "amount": 100,
  "status": "POSTED",
  "category": "Same person transfer",
  "categoryId": "04000000",
  "description": "Transferência Recebida|Vitor Carvalho Sampaio",
  "operationType": "PIX",
  "paymentData": {
    "payer": {
      "name": "Vitor Carvalho Sampaio",
      "branchNumber": "0001",
      "accountNumber": "9482885867-7",
      "routingNumber": "323",
      "documentNumber": { "type": "CPF", "value": "115.308.416-31" },
      "routingNumberISPB": "10573521"
    },
    "receiver": {
      "documentNumber": { "type": "CPF", "value": "115.308.416-31" }
    },
    "paymentMethod": "PIX"
  }
}
```

### Compra em cartao de credito

```json
{
  "id": "1ca7a79d-1328-438e-95f4-d614f01db4c0",
  "date": "2026-03-15T18:13:17.001Z",
  "type": "DEBIT",
  "amount": 832.98,
  "status": "PENDING",
  "category": "Eating out",
  "categoryId": "11010000",
  "merchant": null,
  "description": "Cabana Portena Ltda",
  "descriptionRaw": "Cabana Portena Ltda",
  "paymentData": null,
  "creditCardMetadata": {
    "payeeMCC": 5812,
    "cardNumber": "3732"
  }
}
```

### Compra em supermercado (debito/credito)

```json
{
  "id": "73dd028c-7700-440c-ae7c-b1ccdcd54ff3",
  "date": "2025-12-15T03:00:00.000Z",
  "type": "DEBIT",
  "amount": 252.39,
  "status": "POSTED",
  "category": "Groceries",
  "categoryId": "10000000",
  "description": "SUPERMERCADO E PADARIA BELO HORIZONT BRA",
  "paymentData": null,
  "creditCardMetadata": {
    "billId": "e9d03be5-f045-4a12-927e-f44ed70575d0"
  }
}
```

---

## Categorias Pluggy → App

| Pluggy category         | App category           | Notas                                      |
|-------------------------|------------------------|--------------------------------------------|
| Eating out / Restaurants / Fast Food / Coffee shops / Bars | Alimentacao | |
| Groceries / Supermarkets | Mercado | |
| Pharmacy / Health / Medical expenses | Saude | |
| Taxi and ride-hailing / Transport / Gas Stations / Parking / Tolls | Transporte | |
| Housing / Rent / Utilities | Moradia | |
| Entertainment / Leisure / Travel | Lazer | |
| Subscriptions / Streaming | Assinaturas | |
| Education / Books | Educacao | |
| Clothing / Shopping | Vestuario | |
| Transfer / Transfers | Transferencias | Transferencias para terceiros |
| **Same person transfer** | **Transferencia interna** | **Excluida dos totais** — mesmo CPF em payer e receiver |
| Investments / Savings | Investimentos | |
| Pet supplies and vet / Pets | Pets | |
| Salary / Income / Cashback / Refund | Renda | |
| Insurance / Taxes / Fees / Other | Outros | |

Prefixo antes de ` - ` tambem eh mapeado (ex: `Transfer - PIX` → `Transfer` → `Transferencias`).

---

## Campos-chave

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | string (UUID) | ID unico da transacao no Pluggy |
| `accountId` | string (UUID) | Conta bancaria no Pluggy |
| `type` | `"DEBIT"` / `"CREDIT"` | Direcao do dinheiro |
| `amount` | number | **Assinado** — negativo = debito, positivo = credito. App armazena valor absoluto |
| `status` | `"POSTED"` / `"PENDING"` | Confirmado ou pendente |
| `category` | string | Categoria Pluggy (mapeada para categoria do app) |
| `description` | string | Descricao, pode conter `\|` separando nome do beneficiario |
| `paymentData` | object / null | Presente em PIX/transferencias. Contem `payer` e `receiver` com `name`, `documentNumber`, `branchNumber`, `accountNumber` |
| `merchant` | object / null | Presente em compras. Contem `name`, `businessName`, `mcc` |
| `creditCardMetadata` | object / null | Presente em compras no cartao. Contem `payeeMCC`, `cardNumber`, `billId` |
| `operationType` | string / null | Tipo de operacao (`"PIX"`, etc) |
| `currencyCode` | string | Moeda (`"BRL"`) |
| `balance` | number / null | Saldo apos transacao (nem sempre disponivel) |

---

## Deteccao de Transferencia Interna

A Pluggy classifica automaticamente como `"Same person transfer"` (categoryId `04000000`) quando detecta que `payer` e `receiver` tem o mesmo CPF no `paymentData.documentNumber.value`.

No app, essas transacoes sao mapeadas para a categoria `"Transferencia interna"` e **excluidas dos totais** de despesas e receitas no endpoint `/transactions/summary`.

As transacoes continuam visiveis na listagem para auditoria, mas nao inflam os numeros.

---

## GET /investments?itemId={itemId}

Retorna posicoes de investimentos vinculadas a um item (conexao bancaria). Os dados incluem **cotacao atual** (campo `value`) — verificado comparando com precos de mercado em tempo real.

Paginado da mesma forma que `/transactions`.

```json
{
  "total": 8,
  "totalPages": 1,
  "page": 1,
  "results": [ /* array de Investment */ ]
}
```

---

### Resposta por banco

Cada banco retorna dados com niveis de detalhe diferentes.

#### Inter — FIIs e Acoes (EQUITY)

O Inter retorna ticker no `code`, ISIN, quantidade, preco unitario atual (`value`) e saldo total.

```json
{
  "id": "4f86582e-5f81-4fb8-8cb0-8e421e6c488b",
  "name": "ALZR11",
  "balance": 2690.25,
  "currencyCode": "BRL",
  "type": "EQUITY",
  "subtype": "REAL_ESTATE_FUND",
  "code": "ALZR11",
  "isin": "BRALZRCTF006",
  "value": 10.55,
  "quantity": 255,
  "amount": 2690.25,
  "taxes": null,
  "taxes2": null,
  "date": "2026-03-24T18:49:59.218Z",
  "amountProfit": null,
  "amountWithdrawal": null,
  "amountOriginal": null,
  "dueDate": null,
  "issuer": "ALIANZA TRUST RENDA IMOBILIARIA FDO INV IMOB",
  "issuerCNPJ": null,
  "issueDate": null,
  "purchaseDate": null,
  "rate": null,
  "rateType": null,
  "fixedAnnualRate": null,
  "status": "ACTIVE"
}
```

**Campos relevantes**: `code` (ticker), `isin`, `quantity`, `value` (preco unitario **ao vivo**), `balance` = `value * quantity`.

#### Inter — Renda Fixa (FIXED_INCOME / LCI)

```json
{
  "id": "3d6c26bf-e325-4ffd-b8a4-28040d7afed1",
  "name": "LCI BRB",
  "balance": 104501.12,
  "currencyCode": "BRL",
  "type": "FIXED_INCOME",
  "subtype": "LCI",
  "code": null,
  "value": null,
  "quantity": null,
  "amount": 104501.12,
  "taxes": 0,
  "date": "2026-03-24T03:00:00.000Z",
  "amountProfit": null,
  "amountOriginal": 102000,
  "dueDate": "2027-01-19T00:00:00.000Z",
  "rate": null,
  "rateType": "CDI",
  "fixedAnnualRate": null,
  "status": "ACTIVE"
}
```

```json
{
  "id": "b7d69483-1ef1-422d-a206-13db3719bc39",
  "name": "LCI LIQUIDEZ 6 MESES",
  "balance": 31839.27,
  "currencyCode": "BRL",
  "type": "FIXED_INCOME",
  "subtype": "LCI",
  "amount": 31839.27,
  "amountProfit": 1839.27,
  "amountOriginal": 30000,
  "dueDate": "2030-09-30T03:00:00.000Z",
  "rate": 90,
  "rateType": "CDI",
  "status": "ACTIVE"
}
```

**Campos relevantes**: `amountOriginal` (valor investido), `amount`/`balance` (valor atual), `amountProfit` (lucro, quando disponivel), `rate`/`rateType` (ex: 90% CDI), `dueDate` (vencimento).

#### Inter — Fundos (MUTUAL_FUND)

```json
{
  "id": "fd9e3df7-a18a-4163-a39d-d618ca166a6d",
  "name": "INTER HEDGE INFRAESTRUTURA FIR",
  "balance": 0,
  "currencyCode": "BRL",
  "type": "MUTUAL_FUND",
  "subtype": "FIXED_INCOME_FUND",
  "code": "30.877.528/0001-04",
  "lastTwelveMonthsRate": 13.29,
  "quantity": 0,
  "amount": 0,
  "status": "TOTAL_WITHDRAWAL"
}
```

**Campos relevantes**: `code` (CNPJ do fundo), `lastTwelveMonthsRate` (rentabilidade 12 meses).

#### Nubank — CDB (FIXED_INCOME)

O Nubank retorna cada CDB individual (as "caixinhas" ou RDBs automaticos).

**CDB ativo:**
```json
{
  "id": "9b49bb2d-9995-4980-8dea-ce3b529745eb",
  "name": "CDB - NU FINANCEIRA S.A. - SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO",
  "balance": 1285.13,
  "currencyCode": "BRL",
  "type": "FIXED_INCOME",
  "subtype": "CDB",
  "value": 0.010186,
  "quantity": 126680.3034,
  "amount": 1290.45,
  "taxes": 5.32,
  "taxes2": 0,
  "date": "2026-03-24T19:00:00.000Z",
  "amountProfit": null,
  "amountWithdrawal": 1285.13,
  "amountOriginal": 1266.803034,
  "dueDate": "2028-02-10T03:00:00.000Z",
  "issuer": "NU FINANCEIRA S.A. - SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO",
  "issuerCNPJ": "30.680.829/0001-43",
  "issueDate": "2026-02-10T03:00:00.000Z",
  "purchaseDate": "2026-02-10T03:00:00.000Z",
  "rate": 120,
  "rateType": "CDI",
  "status": "ACTIVE"
}
```

**CDB resgatado:**
```json
{
  "id": "e89fcafc-73da-480e-ac87-733c81c0e67a",
  "name": "CDB - NU FINANCEIRA S.A. - SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO",
  "balance": 0,
  "type": "FIXED_INCOME",
  "subtype": "CDB",
  "value": 0.01,
  "quantity": 0,
  "amount": 0,
  "taxes": 0,
  "amountOriginal": 0,
  "dueDate": "2027-05-09T03:00:00.000Z",
  "rate": 100,
  "rateType": "CDI",
  "purchaseDate": "2025-05-09T03:00:00.000Z",
  "status": "TOTAL_WITHDRAWAL"
}
```

**Campos relevantes**: `amount` (valor bruto), `taxes` (IR retido), `balance` (valor liquido = amount - taxes), `amountOriginal` (valor investido), `rate`/`rateType` (ex: 120% CDI), `dueDate`, `purchaseDate`.

---

## Investment — Campos-chave

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | string (UUID) | ID unico do investimento no Pluggy |
| `name` | string | Nome do ativo ou produto |
| `code` | string / null | Ticker (para acoes/FIIs) ou CNPJ (para fundos) |
| `isin` | string / null | Codigo ISIN (quando disponivel) |
| `type` | string | Tipo: `EQUITY`, `FIXED_INCOME`, `MUTUAL_FUND` |
| `subtype` | string | Subtipo: `STOCK`, `REAL_ESTATE_FUND`, `CDB`, `LCI`, `LCA`, `FIXED_INCOME_FUND`, etc |
| `value` | number / null | **Preco unitario atual (ao vivo)** — verificado contra cotacoes de mercado |
| `quantity` | number / null | Quantidade de cotas/unidades |
| `amount` | number | Valor bruto total (antes de impostos) |
| `balance` | number | Valor liquido total (apos impostos) |
| `taxes` | number / null | IR retido |
| `taxes2` | number / null | IOF retido |
| `amountOriginal` | number / null | Valor originalmente investido |
| `amountProfit` | number / null | Lucro acumulado (quando disponivel) |
| `amountWithdrawal` | number / null | Valor disponivel para resgate |
| `rate` | number / null | Taxa contratada (ex: 120 = 120% do CDI) |
| `rateType` | string / null | Tipo de taxa: `CDI`, `IPCA`, `PREFIXED`, etc |
| `fixedAnnualRate` | number / null | Taxa fixa anual (para prefixados) |
| `dueDate` | string / null | Data de vencimento (ISO) |
| `purchaseDate` | string / null | Data de compra (ISO) |
| `issueDate` | string / null | Data de emissao (ISO) |
| `issuer` | string / null | Emissor do titulo |
| `issuerCNPJ` | string / null | CNPJ do emissor |
| `status` | string | `ACTIVE` ou `TOTAL_WITHDRAWAL` |
| `lastTwelveMonthsRate` | number / null | Rentabilidade ultimos 12 meses (%) |
| `currencyCode` | string | Moeda (`BRL`) |

### Diferenca entre bancos

| Aspecto | Inter | Nubank |
|---------|-------|--------|
| **Acoes/FIIs** | Retorna com ticker, ISIN, preco ao vivo | N/A (nao tem corretora) |
| **Renda fixa** | LCI/LCA com taxa e vencimento | CDB com taxa, vencimento e impostos detalhados |
| **Fundos** | Retorna CNPJ e rentabilidade 12m | N/A |
| **Preco unitario (`value`)** | Ao vivo para equities | Valor unitario do CDB |
| **Impostos** | Geralmente null para equities | `taxes` (IR) e `taxes2` (IOF) detalhados |
| **Valor investido** | `amountOriginal` quando disponivel | `amountOriginal` sempre presente |
