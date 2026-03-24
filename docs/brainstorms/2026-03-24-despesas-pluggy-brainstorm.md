# Brainstorm: Seção de Despesas com Integração Pluggy

**Data:** 2026-03-24
**Status:** Definido

## O Que Estamos Construindo

Uma seção "Despesas" no Cofrinho Gordinho que conecta com bancos brasileiros via Pluggy (Open Finance) para importar transações automaticamente. O usuário conecta seus bancos pelo widget Pluggy, sincroniza manualmente, e visualiza suas despesas categorizadas com totais por categoria.

**Escopo MVP** — sem contas manuais, sem fuzzy merge, sem transfer detection, sem auto-sync.

## Por Que Essa Abordagem

- **MVP enxuto** reduz complexidade e evita adicionar infra nova (Celery, Redis)
- O Pluggy já categoriza transações — basta mapear para categorias em português
- Referência existente no repositório `securo` com integração Pluggy completa para adaptar
- Usuário já tem credenciais Pluggy e 2 bancos conectados — só falta o código

## Decisões Tomadas

### 1. Escopo: MVP Enxuto
- Conectar Pluggy, puxar transações, listar com filtros básicos (data, categoria)
- Sem contas manuais, sem fuzzy merge, sem transfer detection

### 2. Sync: Apenas Manual
- Botão "Sincronizar" na UI, sem Celery/Redis
- Sem background tasks — o FastAPI já roda sem worker extra
- Pode evoluir para cron asyncio no futuro se necessário

### 3. Categorias: Enum Fixo no Código
- Categorias hardcoded (Alimentação, Transporte, Moradia, Lazer, Saúde, Mercado, Assinaturas, Transferências, Outros)
- Mapeamento `PLUGGY_CATEGORY_MAP` do Pluggy para categorias do app (igual ao securo)
- Sem tabela Category no banco, sem CRUD de categorias

### 4. Navegação: Top-Level no Sidebar
- Item "Despesas" no mesmo nível de "Visão Geral", "Mensal", etc.
- Rota: `/carteira/despesas`

### 5. Visualizações: Lista + Totais por Categoria
- Resumo/cards no topo com totais por categoria do mês selecionado
- Tabela (desktop) / Cards (mobile) de transações abaixo
- Filtro por mês (similar ao padrão existente de navegação mensal)

### 6. Conexão Bancária: Embutida na Página de Despesas
- Botão "Conectar Banco" e status da conexão direto na página de Despesas
- Sem página separada de conexões
- Se não tem conexão: mostra CTA para conectar
- Se tem conexão: mostra status + botão sync + lista de transações

## Arquitetura Técnica (Alto Nível)

### Backend — Novos Componentes
- **Model `BankConnection`** — provider, external_id (item_id), institution_name, status, last_sync_at, credentials (JSON)
- **Model `Transaction`** — account_id, external_id, description, amount, date, type (debit/credit), category (enum string), source, status, raw_data (JSON)
- **Model `Account`** (opcional/simples) — connection_id, external_id, name, type, balance
- **Provider `PluggyProvider`** — adaptar do securo (auth, connect_token, fetch transactions)
- **Router `/api/connections`** — connect-token, callback, sync, delete
- **Router `/api/transactions`** — list com filtros (mês, categoria)

### Frontend — Novos Componentes
- **Página `/carteira/despesas`** — página principal
- **`BankConnectDialog`** — wrapper do widget `react-pluggy-connect`
- **Resumo por categoria** — cards/barras com totais
- **Lista de transações** — tabela desktop + MobileCard

### Dependências Novas
- Backend: `httpx` (para chamadas à API Pluggy)
- Frontend: `react-pluggy-connect` (widget Pluggy)

## Referência: Securo

O repositório `~/securo` tem a integração Pluggy completa. Arquivos-chave para adaptar:
- `backend/app/providers/pluggy.py` → Provider com auth, connect_token, fetch transactions
- `backend/app/services/connection_service.py` → Category mapping, sync logic
- `backend/app/api/connections.py` → Endpoints REST
- `frontend/src/components/bank-connect-dialog.tsx` → Widget wrapper
- `backend/app/models/bank_connection.py` → Model de conexão

## Fora de Escopo (Futuro)
- Auto-sync (Celery ou asyncio cron)
- Transações manuais e fuzzy merge
- Transfer detection entre contas
- Payee extraction configurável
- Gráficos de pizza/barras por categoria
- Página separada de conexões
- CRUD de categorias customizadas
