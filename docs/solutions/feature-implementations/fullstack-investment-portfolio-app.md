---
title: Full-Stack Investment Portfolio Management System - Complete Implementation
date: 2026-03-18
category: feature-implementations
tags:
  - fastapi
  - next.js
  - sqlalchemy
  - jwt-auth
  - portfolio-management
  - real-time-pricing
  - data-import
  - docker
  - fullstack
severity: n/a
component: full-stack (backend + frontend + scripts)
related_issues: []
---

# Full-Stack Investment Portfolio Management System

## Problem

A 73-asset investment portfolio (30 US Stocks, 30 Brazilian Stocks, 10 FIIs, 3 Fixed Income) was managed in an Excel spreadsheet (`carteira_investimentos (8).xlsx`). The spreadsheet had critical limitations:

- **Manual price updates** - No live data, prices entered by hand
- **Brittle formulas** - Easy to break when adding/removing assets
- **No mobile access** - Desktop Excel only
- **No rebalancing engine** - Gap analysis done manually
- **No audit trail** - No transaction history beyond what was manually tracked

## Solution

Built a complete fullstack web application (79 files) in a single session:

| Layer | Technology | Key Libraries |
|-------|-----------|---------------|
| **Backend** | FastAPI + Python 3.14 | SQLAlchemy 2.0, Alembic, aiomysql, python-jose, passlib, yfinance, httpx |
| **Frontend** | Next.js 15 (App Router) | TypeScript, Tailwind CSS v4, recharts, lucide-react |
| **Database** | MySQL 8.0 | Docker Compose |
| **Auth** | JWT | python-jose + bcrypt |
| **Prices** | yfinance + brapi.dev | yfinance (US), httpx (BR API) |

### Setup Instructions

```bash
# 1. Configure environment
cp .env.example .env  # Edit with your settings

# 2. Start services
docker-compose up -d  # MySQL:3306, Backend:8000, Frontend:3000

# 3. Initialize database and seed user
cd backend && alembic upgrade head
python scripts/seed_user.py

# 4. Import Excel data (one-time)
python scripts/import_excel.py

# 5. Access the app
open http://localhost:3000/login
```

## Key Architecture Decisions

### 1. Dual Price Source Strategy with Currency Normalization

**Pattern:** BRL as base currency; US stock prices converted and cached in BRL.

**File:** `backend/app/services/price_service.py`

The app fetches prices from two sources:
- **US Stocks:** `yfinance` (batch downloads of up to 10 tickers at a time)
- **BR Stocks/FIIs:** `brapi.dev` (batch API calls of up to 20 tickers)

USD/BRL rate is fetched first via `yfinance` ("USDBRL=X"), cached in `UserSettings`, then used to convert all US stock prices to BRL before storage.

```python
# Fetch USD/BRL first
rate = await self._fetch_usd_brl()
await self._save_usd_brl(rate)

# Batch fetch US stocks (10 at a time)
for i in range(0, len(tickers), 10):
    batch = tickers[i : i + 10]
    data = await loop.run_in_executor(
        None,
        lambda b=batch: yf.download(b, period="1d", progress=False),
    )
    # Convert to BRL
    price_brl = Decimal(str(float(close))) * usd_brl_rate
    asset.current_price = round(price_brl, 4)
```

Prices are cached in the database and only refreshed when the user clicks "Atualizar Cotacoes". No automatic polling - keeps API usage low and gives user control.

### 2. Computed Positions at Query Time (No Position Table)

**Pattern:** Positions are aggregated from `Purchase` records on-the-fly using SQL `SUM(quantity)` and `SUM(total_value)`.

**File:** `backend/app/routers/portfolio.py`

```python
result = await db.execute(
    select(
        Asset.id, Asset.ticker, Asset.current_price,
        func.sum(Purchase.quantity).label("total_qty"),
        func.sum(Purchase.total_value).label("total_cost"),
    )
    .join(Asset, Purchase.asset_id == Asset.id)
    .where(Purchase.user_id == user.id, Asset.type == asset_class)
    .group_by(Asset.id)
    .having(func.sum(Purchase.quantity) > 0)
)

for row in result.all():
    avg_price = cost / qty
    market_value = price * qty
    pnl = market_value - cost
```

**Benefits:**
- No synchronization issues between purchases and positions
- Full purchase history retained for audit trail
- Simpler data model (7 tables instead of 8)

### 3. Proportional Gap-Based Rebalancing Algorithm

**Pattern:** Equal-weight within each asset class; distribute contribution proportionally to gaps among top N underweight assets.

**File:** `backend/app/services/rebalancing_service.py`

Two levels:

**Class-level:**
```python
for asset_class in AssetType:
    target_value = patrimonio_pos_aporte * targets[asset_class]
    gap = target_value - current_value
    class_gaps[asset_class] = gap

positive_gaps = {k: v for k, v in class_gaps.items() if v > 0}
total_positive_gap = sum(positive_gaps.values())
for asset_class, gap in positive_gaps.items():
    class_allocations[asset_class] = contribution * gap / total_positive_gap
```

**Asset-level (within class):**
```python
n_assets = len(assets_in_class)
target_per_asset = patrimonio_pos_aporte * target_class_pct / n_assets

asset_gaps.sort(key=lambda x: x[3], reverse=True)
top_assets = [a for a in asset_gaps if a[3] > 0][:top_n]
for ticker, current_val, target_val, gap in top_assets:
    amount = class_contribution * gap / total_gap_top
```

### 4. Client-Side Auth Context with JWT

**Files:** `frontend/src/lib/auth.ts`, `frontend/src/lib/api.ts`

```typescript
// API client automatically attaches JWT and handles 401
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  return res.json();
}
```

### 5. Excel Import with Section-Based Row Parsing

**File:** `scripts/import_excel.py`

```python
sections = [
    (6, 35, AssetType.STOCK),   # Stocks rows 6-35
    (39, 68, AssetType.ACAO),   # Acoes rows 39-68
    (72, 81, AssetType.FII),    # FIIs rows 72-81
    (85, 87, AssetType.RF),     # RF rows 85-87
]

for start_row, end_row, asset_type in sections:
    for row in range(start_row, end_row + 1):
        ticker = ws.cell(row=row, column=3).value
        # ... import asset
```

All imports check for existing records before inserting to allow safe re-runs.

## Database Schema

7 tables:

1. **users** - id, username, password_hash, created_at
2. **assets** - id, ticker (unique), type (enum: STOCK/ACAO/FII/RF), description, current_price, price_updated_at
3. **purchases** - id, asset_id (FK), user_id (FK), purchase_date, quantity, unit_price, total_value
4. **fixed_income_positions** - id, asset_id (FK), user_id (FK), applied_value, current_balance, yield_pct, maturity_date
5. **allocation_targets** - id, user_id (FK), asset_class (enum), target_pct
6. **user_settings** - id, user_id (FK, unique), usd_brl_rate, rate_updated_at
7. **monthly_snapshots** - id, user_id (FK), month, total_patrimonio, allocation_breakdown (JSON), daily_patrimonio (JSON)

**Design decisions:**
- `Numeric(18, 4)` for prices, `Numeric(18, 8)` for quantities
- Position computed from purchases at query time (no stored positions)
- BRL as base currency, USD prices converted before storage
- Purchases append-only (no sales/disposals in v1)

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Login | JWT auth form |
| `/carteira` | Painel | Monthly dashboard with summary cards, allocation bars, patrimonio chart |
| `/carteira/stocks` | Stocks | US stock positions table |
| `/carteira/acoes` | Acoes | BR stock positions table |
| `/carteira/fiis` | FIIs | FII positions table |
| `/carteira/renda-fixa` | Renda Fixa | Fixed income positions |
| `/carteira/aportes` | Aportes | Purchase history |
| `/desejados` | Rebalancing | Allocation targets editor + gap analysis + investment planner |

Dark theme with CSS variables (bg: `#0f1117`, cards: `#1e2130`, accent: `#3b82f6`).

## Prevention Strategies

### Common Pitfalls

- **Python 3.14 + SQLAlchemy:** Use `Optional[T]` instead of `T | None` in `Mapped` types (typing.Union breaking change)
- **Decimal Precision:** Always use `Decimal(str(value))` for financial math, never `float`
- **Timezone:** Use `datetime.now(timezone.utc)` not `datetime.utcnow()` (deprecated)
- **Async Context:** yfinance is synchronous; wrapping in `run_in_executor` is correct but don't await inside executor callbacks

### Testing Priority

1. **Decimal arithmetic** - quantity * unit_price precision, USD/BRL conversion, P&L calculations
2. **JWT validation** - invalid/expired tokens, wrong user_id, missing 'sub' claim
3. **Data isolation** - users can only see their own purchases/portfolio
4. **Price update flow** - batch fetch, conversion, partial failure handling
5. **Portfolio calculations** - empty portfolio, single/multiple purchases, null prices

### Security Checklist

- [ ] Change `SECRET_KEY` from default before deployment
- [ ] Change `ADMIN_PASSWORD` to strong random value
- [ ] Remove `.env` from git history if committed
- [ ] Update CORS origins to production domain
- [ ] Add rate limiting to auth endpoints (`slowapi`)
- [ ] Consider moving JWT to httpOnly cookie (XSS protection)
- [ ] Add JWT refresh token mechanism (currently only 24h access token)

### Deployment Checklist

- [ ] Generate strong `SECRET_KEY`: `python -c "import secrets; print(secrets.token_hex(32))"`
- [ ] Use managed MySQL (RDS), not Docker volume for production
- [ ] Use Gunicorn + Uvicorn workers (not `--reload`)
- [ ] Enable HTTPS + security headers
- [ ] Set up automated database backups
- [ ] Add structured logging (JSON format)
- [ ] Monitor: API response time, DB pool usage, failed price updates, JWT failures

## Project Impact

**Before:** 73-asset portfolio managed in Excel with manual price updates and fragile formulas.

**After:** Fullstack web app with:
- Live price updates from 2 data sources (on-demand, cached)
- Automated rebalancing calculations (gap-based, proportional allocation)
- Dark-themed responsive UI accessible from any device
- Complete audit trail of all purchases
- Asset catalog management
- Month-by-month portfolio analysis with navigation

## Related Documentation

- [Brainstorm](../../brainstorms/2026-03-18-carteira-investimentos-app-brainstorm.md) - Initial feature exploration and requirements
- [Implementation Plan](../../plans/2026-03-18-feat-carteira-investimentos-fullstack-app-plan.md) - Detailed 6-phase implementation roadmap
- Source data: `carteira_investimentos (8).xlsx` (6 sheets, 73 assets)
- Design reference: `image.png` (Securo app dark theme UI)
