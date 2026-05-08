# Suíte de testes

## Backend (pytest + coverage)

```bash
cd backend
python -m venv .venv-test
.venv-test/bin/pip install -r requirements-dev.txt
.venv-test/bin/pytest                # roda com gate de cobertura 90%
.venv-test/bin/pytest --no-cov       # só os testes
.venv-test/bin/pytest tests/unit     # só unit
```

- SQLite in-memory via `aiosqlite` (StaticPool) — banco zerado por teste.
- `tests/conftest.py` injeta env (SECRET_KEY, ENCRYPTION_KEY, etc.) antes de importar `app.config`, sobrescreve `get_db` via `dependency_overrides` e desabilita rate limiter.
- `tests/factories.py` constrói rows (`make_asset`, `make_purchase`, `link_user_asset`, …).
- `auth_client` / `admin_client`: clientes httpx já com `get_current_user` overridado.

**Status atual:** 117 testes passando, ~53% de cobertura. O threshold está em 90% em `pytest.ini`. Para fechar a lacuna, faltam testes mockados para integrações externas:
- `app/services/price_service.py` (yfinance + brapi)
- `app/services/snapshot_service.py`
- `app/services/bastter_sync_service.py`, `app/services/dividend_service.py`
- `app/services/pluggy_service.py`, `app/services/ocr_service.py`
- routers: `connections`, `ocr`, `bastter_sync`, `pluggy_credentials`, `portfolio`, `retirement`, `saved_plans`, `transactions`, `fixed_income`, `admin`
- `app/scheduler.py`, `app/worker.py`

Use `respx` para mocks de httpx (Pluggy / Bastter / Turnstile / brapi) e `pytest-mock`/`monkeypatch` para `yfinance`/`google-genai`.

## Frontend (Vitest + coverage)

```bash
cd frontend
npm install
npm test                # vitest run
npm run test:watch
npm run test:coverage   # threshold 90%
```

- `tests/setup.ts` configura jsdom + MSW + stubs (matchMedia, IntersectionObserver, scrollTo).
- `tests/msw/handlers.ts` define handlers default; testes individuais usam `server.use(...)` para sobrescrever.
- `vitest.config.ts` com `@/` alias e threshold 90% por linhas/functions/branches.

**Status atual:** 47 testes passando cobrindo `lib/` (format, api, auth) e dois componentes (summary-cards, month-picker). Para fechar pra 90% faltam testes para os ~33 componentes restantes e páginas — todos seguindo o padrão dos exemplos.

## E2E (Playwright)

```bash
cd frontend
npm run test:e2e:install   # instala browsers
npm run test:e2e
```

`playwright.config.ts` sobe `npm run dev` automaticamente. Para CI ou backend já rodando, exporte `E2E_NO_SERVER=1`.

## CI

`.github/workflows/test.yml` roda em PRs e push pra `main`:
1. `backend` — pytest com gate 90%.
2. `frontend-unit` — vitest com gate 90%.
3. `e2e` — sobe MySQL + Redis, aplica migrações, sobe backend + frontend, roda Playwright.

Artefatos (coverage, playwright report) ficam disponíveis em caso de falha.
