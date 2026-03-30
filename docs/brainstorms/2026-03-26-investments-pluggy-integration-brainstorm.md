# Investments Pluggy Integration

**Date:** 2026-03-26
**Status:** Ready for planning

## What We're Building

Integrar o endpoint `/investments` do Pluggy na carteira de investimentos existente, trazendo posições ao vivo de bancos conectados (Inter, Nubank). Os dados do Pluggy substituem dados manuais para ativos cobertos, e coexistem com ativos que só existem no sistema manual (yfinance).

### Escopo

- Buscar investimentos do Pluggy durante o sync de conexão (botão "Sincronizar" existente)
- Armazenar posições do Pluggy no banco (modelo próprio)
- Na carteira, mesclar: ativos Pluggy + ativos manuais, sem duplicação
- Indicador visual (badge/ícone) nos ativos que vieram do Pluggy
- Suportar: EQUITY (FIIs/ações), FIXED_INCOME (LCI/LCA/CDB), MUTUAL_FUND

## Why This Approach

### Pluggy como fonte única para bancos conectados

- **Verificado:** preços do Pluggy (`value`) são ao vivo e batem com o mercado (diff < R$1)
- **Verificado:** tickers do Pluggy (ALZR11, BTLG11, etc.) são idênticos aos do sistema manual
- **Verificado:** Pluggy traz quantidade, preço unitário e saldo — tudo que precisamos
- **Benefício:** elimina necessidade de inserir compras manualmente para bancos conectados
- **Benefício:** LCIs/CDBs que não existiam no sistema agora aparecem automaticamente

### Coexistência com sistema manual

Ativos em corretoras não conectadas (ex: ações US via Avenue, ações BR via XP) continuam usando o sistema manual (purchases + yfinance). A carteira mostra tudo junto.

### Conflito: Pluggy prevalece

Se o mesmo ticker existe no Pluggy E no manual, Pluggy é a fonte de verdade. Evita duplicação e simplifica a lógica.

## Key Decisions

1. **Pluggy é fonte de verdade** para ativos de bancos conectados — quantidade e preço vêm do Pluggy
2. **Sync junto com transações** — ao clicar "Sincronizar", busca transações E investimentos
3. **Integrar nas abas existentes** — FIIs do Pluggy na aba FIIs, LCIs/CDBs na aba Renda Fixa
4. **Badge "Pluggy"** — indicador visual sutil de que o dado veio do Pluggy
5. **Pluggy prevalece em conflitos** — se ticker existe em ambos, usa dados do Pluggy
6. **Modelo separado** — `PluggyInvestment` no DB (não mistura com Asset/Purchase)

## Data Discovery (Teste Real)

### Inter (7 ativos ativos)

| Tipo | Ativo | Qtd | Preço Pluggy | Preço DB | Match |
|------|-------|-----|-------------|----------|-------|
| EQUITY/FII | ALZR11 | 255 | R$10.55 | R$10.55 | Exato |
| EQUITY/FII | BTLG11 | 26 | R$103.66 | R$103.17 | ~R$0.49 |
| EQUITY/FII | HGBS11 | 134 | R$20.12 | R$20.34 | ~R$0.22 |
| EQUITY/FII | RZTR11 | 29 | R$94.01 | R$94.85 | ~R$0.84 |
| EQUITY | HGBS12 | 33 | R$0.02 | N/A | Direito subscrição |
| FIXED_INCOME/LCI | LCI BRB | - | - | N/A | R$104,501 (invest. R$102k) |
| FIXED_INCOME/LCI | LCI 6m | - | - | N/A | R$31,839 (invest. R$30k) |

### Nubank (4 CDBs ativos)

| Tipo | Saldo Líquido | Investido | Taxa |
|------|---------------|-----------|------|
| CDB | R$1,286 | R$1,267 | 120% CDI |
| CDB | R$8,791 | R$8,723 | ? |
| CDB | R$10,078 | R$10,000 | ? |
| CDB | R$7,548 | R$7,500 | ? |

**Total Nubank:** ~R$27,703

## Mapping: Pluggy → Sistema

| Pluggy type | Pluggy subtype | Aba na carteira | Fonte de preço |
|-------------|---------------|-----------------|----------------|
| EQUITY | REAL_ESTATE_FUND | FIIs | `value` (ao vivo) |
| EQUITY | STOCK | Ações | `value` (ao vivo) |
| FIXED_INCOME | CDB | Renda Fixa | `balance` (saldo líquido) |
| FIXED_INCOME | LCI/LCA | Renda Fixa | `balance` (saldo líquido) |
| MUTUAL_FUND | * | Renda Fixa | `balance` (saldo líquido) |
