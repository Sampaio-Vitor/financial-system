# CofrinhoGordinho 🐷

Sistema completo de gestão de carteira de investimentos para investidores brasileiros. Acompanhe ações, ETFs, FIIs e renda fixa com cotações em tempo real, rebalanceamento automatizado e importação via OCR.


## Funcionalidades

### Carteira
- **Acompanhamento de ativos** — Ações BR/US, ETFs, FIIs e Renda Fixa com P&L por posição
- **Cotações automáticas** — Preços atualizados diariamente via Yahoo Finance (BR e US), com conversão automática USD→BRL
- **Snapshots mensais** — Histórico completo do patrimônio com breakdown por ativo
- **Proventos** — Detecção automática de dividendos a partir de transações bancárias

### Aportes e Importação
- **Cadastro manual** — Formulário com suporte a câmbio e múltiplas moedas
- **Import CSV/Excel** — Upload em lote de planilhas com compras
- **Import OCR (IA)** — Envie screenshots do app da corretora e a Gemini Vision extrai ticker, data, quantidade e preço automaticamente

### Planejamento
- **Metas de alocação** — Defina % alvo por classe (Ações BR, Ações US, ETF Intl, FII, RF)
- **Rebalanceamento** — Calcule onde investir o próximo aporte para atingir seus alvos
- **Planos salvos** — Histórico de recomendações de rebalanceamento
- **Reserva de emergência** — Controle de depósitos/retiradas com meta configurável
- **Aposentadoria** — Planejamento básico de meta de aposentadoria

### Integrações
- **Pluggy** — Sincronização de contas bancárias e transações via Open Finance
- **Bastter** — Sincronização de compras com a plataforma Bastter

## Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| **Frontend** | Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Recharts |
| **Banco de dados** | MySQL 8.0 |
| **Fila/Cache** | Redis + arq (worker assíncrono para OCR) |
| **Auth** | JWT (access + refresh token), httponly cookies, CSRF middleware |
| **Cotações** | Yahoo Finance (yfinance) |
| **OCR** | Google Gemini 2.5 Flash Lite |
| **Infra** | Docker Compose, Caddy (reverse proxy), Cloudflare (DNS/SSL) |

## Estrutura do Projeto

```
financial_system/
├── backend/
│   ├── app/
│   │   ├── main.py              # App FastAPI, routers, middleware
│   │   ├── models/              # Modelos SQLAlchemy (26 modelos)
│   │   ├── routers/             # 22 módulos de endpoints (~150 rotas)
│   │   ├── schemas/             # Schemas Pydantic (request/response)
│   │   ├── services/            # Lógica de negócio (preços, portfolio, OCR, etc.)
│   │   ├── scheduler.py         # APScheduler - atualização diária de preços
│   │   └── worker.py            # arq worker - processamento OCR
│   ├── alembic/                 # Migrations do banco
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/                 # Pages (App Router)
│   │   │   ├── carteira/        # Dashboard e sub-páginas (11 páginas)
│   │   │   └── desejados/       # Planejamento e rebalanceamento
│   │   ├── components/          # 30+ componentes React
│   │   ├── lib/                 # Utilitários (API client, auth, formatação)
│   │   └── types/               # Interfaces TypeScript
│   └── Dockerfile
├── docker-compose.yml           # Base (MySQL, Redis, Backend, Frontend, Worker)
├── docker-compose.override.yml  # Dev (ports, volumes, hot-reload)
├── docker-compose.prod.yml      # Prod (Caddy, standalone, appuser)
└── docs/                        # Planos e brainstorms
```

## Setup Local

### Pré-requisitos
- Docker e Docker Compose

### 1. Clone e configure

```bash
git clone https://github.com/Sampaio-Vitor/financial_system.git
cd financial_system
cp .env.example .env
```

Edite o `.env` com seus valores:
- `SECRET_KEY` — gere com `openssl rand -hex 32`
- `GEMINI_API_KEY` — necessário apenas para funcionalidade de OCR
- `ENCRYPTION_KEY` — necessário apenas para integração Pluggy

### 2. Inicie os containers

```bash
docker compose up --build
```

Isso sobe: MySQL, Redis, Backend (`:8000`), Frontend (`:3000`) e Worker (OCR).

O backend roda `alembic upgrade head` automaticamente no startup.

### 3. Crie um usuário

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "seu_usuario", "password": "sua_senha"}'
```

Acesse em **http://localhost:3000**

## Deploy em Produção

A stack usa um padrão de 3 arquivos Docker Compose:

```bash
# Build e sobe em produção
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

**Arquitetura:** Browser → Cloudflare (SSL) → VPS → Caddy (:443) → Frontend (:3000) → rewrites `/api/*` → Backend (:8000) → MySQL (:3306)

CI/CD configurado via GitHub Actions — push na `main` faz deploy automático no VPS.

## Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|:-----------:|
| `DATABASE_URL` | URL de conexão MySQL | ✅ |
| `SECRET_KEY` | Chave para assinatura JWT | ✅ |
| `GEMINI_API_KEY` | API key do Google Gemini (OCR) | Apenas OCR |
| `REDIS_URL` | URL do Redis | ✅ |
| `ENCRYPTION_KEY` | Chave Fernet (credenciais Pluggy) | Apenas Pluggy |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile CAPTCHA | Opcional |
| `CORS_ORIGINS` | Origens permitidas (comma-separated) | Opcional |
| `API_DOCS_ENABLED` | Habilita Swagger UI em `/docs` | Opcional |

## Fluxo de Dados

### Atualização de Preços
1. APScheduler dispara job diário às 21:00 UTC
2. Busca taxas de câmbio (USD/BRL, EUR/BRL, GBP/BRL) e preços de todos os ativos via Yahoo Finance
3. Gera snapshot diário para cada usuário

### Import via OCR
1. Usuário envia screenshots do app da corretora (até 5 imagens)
2. Backend enfileira jobs no Redis → arq worker processa com Gemini Vision
3. Frontend faz polling do status e exibe os dados extraídos para revisão
4. Usuário confirma → compras são criadas em lote

### Cálculo de Portfolio
- Posições são computadas em tempo de consulta a partir das compras (sem tabela de posição separada)
- BRL é a moeda base; ativos US são convertidos pela taxa de câmbio cacheada
- Preços ficam no banco e só atualizam no job diário ou por ação do usuário

## API

Com `API_DOCS_ENABLED=true`, a documentação Swagger fica disponível em:

```
http://localhost:8000/docs
```

### Principais endpoints

| Rota | Descrição |
|------|-----------|
| `POST /api/auth/login` | Login (retorna JWT em cookie) |
| `GET /api/portfolio/overview` | Visão geral do patrimônio |
| `GET /api/portfolio/positions` | Posições de renda variável |
| `POST /api/purchases` | Registrar compra |
| `POST /api/prices/update` | Atualizar cotações |
| `POST /api/ocr/upload` | Upload de imagens para OCR |
| `POST /api/rebalancing` | Calcular rebalanceamento |
| `GET /api/snapshots/monthly` | Histórico mensal |

## Licença

Repositório público no GitHub. Uso pessoal.
