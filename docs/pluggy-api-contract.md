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
