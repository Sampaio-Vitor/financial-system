# Carteira de Investimentos - Fullstack App

**Date:** 2026-03-18
**Status:** Draft

## What We're Building

A fullstack investment portfolio management app that replaces the current Excel spreadsheet (`carteira_investimentos.xlsx`). The app manages a portfolio of 73 assets across 4 classes: US Stocks (30), Brazilian Stocks (30), FIIs (10), and Fixed Income (3 types).

**Tech Stack:** FastAPI (Python) + Next.js + MySQL

**Two main sections:**
1. **Carteira (Portfolio)** - View current holdings, positions, P&L, and purchase history
2. **Ativos Desejados (Desired Assets / Rebalancing)** - Manage target allocation, see where to invest next based on gap analysis

## Why This Approach

The spreadsheet works but lacks: live price updates, easy asset management, mobile-friendly access, and a polished UI. A web app with a dark-themed dashboard (inspired by the Securo reference) will make portfolio tracking more practical and enjoyable.

**FastAPI** was chosen for its async support, auto-generated API docs, and clean Python typing. **Next.js** provides SSR, routing, and a mature React ecosystem. **MySQL** for reliable relational storage of financial data.

## Key Decisions

### Pages & Navigation

**Carteira section (6 subpages):**
- **Overview (Painel Mensal)** - Monthly dashboard (like Securo reference). Navigated via `< Mes/Ano >` arrows. Shows: patrimonio at end of month, aportes made that month, allocation breakdown by class, patrimonio evolution chart (line graph over days of the month), and list of transactions (purchases) in that period. Summary cards: Total Patrimonio, Aportes do Mes, Variacao do Mes (R$ and %), Alocacao vs Meta.
- **Stocks (EUA)** - Table of US stock positions with qty, avg price, current price, market value, P&L
- **Acoes (Brasil)** - Same table format for Brazilian stocks
- **FIIs** - Same table format for FII positions
- **Renda Fixa** - Table with applied value, current balance, yield, yield%, maturity date
- **Historico de Aportes** - Purchase history with filters by date, ticker, type

**Ativos Desejados section (rebalancing):**
- Editable allocation targets (% per class, currently 30/30/10/30)
- Current allocation vs target visualization
- Monthly contribution input (e.g., R$50,000)
- Gap analysis table: which assets are furthest below target
- Top X assets to invest in this month, with calculated amounts
- Full ranking of all 71 assets by gap

### Asset Management

- **Add asset to catalog**: Separate flow on the Desired Assets page. User enters ticker, type (Stock/Acao/FII/RF), and description. System fetches current price from API.
- **Remove asset from catalog**: Remove button with confirmation. Warns if asset has existing positions.
- **Record purchase**: Separate flow on the Carteira page. User selects asset, enters date, qty, unit price (auto-fills from cached price). Calculates total and updates position.

### Price Updates

- Prices are **cached** in the database (last fetched price + timestamp)
- User clicks an **"Atualizar Cotacoes"** button to refresh all prices from external API
- When a **new asset is added**, its price is fetched immediately
- API source: Yahoo Finance (yfinance) for US stocks, brapi.dev or similar for BR stocks/FIIs
- USD/BRL exchange rate also fetched and cached

### Authentication

- Simple login: single username/password
- JWT-based auth via FastAPI
- No registration flow (user is seeded via script or env vars)

### Data Import

- One-time Python script to import all data from the Excel spreadsheet
- Imports: asset catalog (70 RV + 3 RF), purchase records (Aportes), RF positions, allocation targets, current USD/BRL rate

### Styling

- **Dark theme** inspired by the Securo reference image
- Dark sidebar with navigation icons
- Cards with dark backgrounds and subtle borders
- Green for positive values, red for negative
- Progress bars for allocation visualization
- Clean tables with alternating row shading
- Responsive layout (desktop-first, mobile-friendly)

## Data Model (High-Level)

- **User** - id, username, password_hash
- **Asset** - id, ticker, type (Stock/Acao/FII/RF), description, current_price, price_updated_at
- **Position** - derived from purchases: asset_id, total_qty, total_cost, avg_price
- **Purchase** (Aporte) - id, asset_id, date, qty, unit_price, total_value
- **FixedIncomePosition** - id, asset_id, description, applied_value, current_balance, yield_value, yield_pct, maturity_date, start_date
- **AllocationTarget** - id, asset_class, target_pct
- **Settings** - usd_brl_rate, last_rate_update

## API Structure

- `POST /auth/login` - JWT login
- `GET/POST/DELETE /assets` - Asset catalog CRUD
- `GET/POST /purchases` - Purchase records
- `GET/PUT /fixed-income` - Fixed income positions
- `GET/PUT /allocation-targets` - Editable allocation targets
- `GET /portfolio/overview?month=2026-03` - Monthly dashboard data (patrimonio, aportes, allocation, evolution)
- `GET /portfolio/{asset_class}` - Positions by class
- `POST /prices/update` - Trigger price refresh
- `GET /rebalancing?contribution=50000` - Calculate rebalancing plan

## Open Questions

_None - all major questions resolved during brainstorming._
