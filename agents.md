# Agents Guide — Financial System

Quick reference for AI agents working in this repo. For deeper context, also read `README.md` and `docs/`.

## Repo Overview

Personal portfolio / financial tracker.

- **Backend:** FastAPI + SQLAlchemy 2.0 (async) + MySQL (aiomysql) + Alembic + Redis/arq worker
- **Frontend:** Next.js 15 (App Router, standalone output) + TypeScript + Tailwind v4 + recharts
- **Auth:** JWT (python-jose + passlib/bcrypt)
- **Prices:** yfinance (US) + brapi.dev (BR stocks/FIIs) + Tesouro Direto scraper
- **OCR:** Gemini API (worker service via arq queue)
- **Bank sync:** Pluggy (MeuPluggy) — see `memory/reference_pluggy_setup.md`

### Layout

```
backend/         FastAPI app — app/{models,schemas,routers,services}, alembic/
frontend/        Next.js app — src/{app,components,lib,types}
scripts/         One-time Excel import
docs/            Plans / brainstorms
ocr/             OCR-related assets
Caddyfile        Prod reverse proxy
docker-compose.yml             base (no host ports, env defaults)
docker-compose.override.yml    auto-loaded in dev (ports, volumes, --reload)
docker-compose.prod.yml        prod (appuser, standalone, Caddy)
```

### Services (compose)
- `mysql` — MySQL 8.0, volume `mysql_data`, container `portfolio_db`
- `backend` — FastAPI, container `portfolio_api`, runs `alembic upgrade head` then uvicorn
- `redis` — Redis 7 alpine, container `portfolio_redis`
- `worker` — arq worker for OCR, container `portfolio_worker`
- `frontend` — Next.js standalone, container `portfolio_frontend`

In prod, only Caddy (80/443) is exposed; frontend/backend/db talk over the compose network.

### Conventions / Gotchas
- BRL is base currency; US prices stored in BRL (cached USD/BRL rate).
- Position is computed at query time from purchases (no `Position` table).
- Prices cached in DB; refresh only on user action ("Atualizar Cotações").
- Frontend does NOT use `NEXT_PUBLIC_API_URL`; calls go through Next.js rewrites to `/api/*`.
- `API_URL` baked at build time (Dockerfile ARG, defaults to `http://backend:8000`).
- Use `Optional[T]` not `T | None` in SQLAlchemy `Mapped` types (Python 3.14 compat).
- SQLAlchemy must be `>= 2.0.40` for Python 3.14.
- **Always build locally before pushing:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml build` to catch TS errors / missing fields.
- When adding fields to shared types (`Asset` etc.), grep for manual constructions: `Asset[]`, `as Asset`, `: Asset =`.
- No admin auto-seed; create users via `/api/auth/register` or direct DB insert.
- Never commit unless explicitly asked.

## Production / VPS

- **Domain:** cofrinhogordinho.uk (Cloudflare → SSL Full Strict)
- **VPS:** `31.97.22.150`, user `root`
- **Project path:** `/root/financial-system` (NOT `/opt/` — snap Docker can't access it)
- **TLS certs:** `/root/financial-system/certs/origin.pem` + `origin-key.pem` (Cloudflare origin cert)
- **Firewall (UFW):** only 22, 80, 443 open
- **CI/CD:** `.github/workflows/deploy.yml` on push to `main` → SSH → git pull → `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- **GitHub secrets:** `VPS_HOST`, `VPS_SSH_KEY`
- **Other tenant:** `healiamonolito` runs on same VPS using host ports 3000/8000/3001 — financial-system exposes nothing on host except Caddy.
- **Snap Docker quirks:** `!override []` for `ports` does NOT work; use the 3-file compose pattern instead.

### SSH into prod

```bash
ssh -i ~/.ssh/vps_id_rsa root@31.97.22.150
cd /root/financial-system
```

Useful one-liners:

```bash
# Check running containers
ssh -i ~/.ssh/vps_id_rsa root@31.97.22.150 'cd /root/financial-system && docker compose -f docker-compose.yml -f docker-compose.prod.yml ps'

# Tail backend logs
ssh -i ~/.ssh/vps_id_rsa root@31.97.22.150 'docker logs -f --tail 200 portfolio_api'

# Force redeploy (already triggered by push to main)
ssh -i ~/.ssh/vps_id_rsa root@31.97.22.150 'cd /root/financial-system && git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build'
```

### Access prod DB (MySQL)

The MySQL container has no host port exposed. Access it from inside the VPS:

```bash
# Open a mysql shell as root
ssh -i ~/.ssh/vps_id_rsa root@31.97.22.150 \
  'docker exec -it portfolio_db mysql -uroot -p"$(grep ^MYSQL_ROOT_PASSWORD /root/financial-system/.env | cut -d= -f2)" portfolio'

# Or as the app user
ssh -i ~/.ssh/vps_id_rsa root@31.97.22.150 \
  'docker exec -it portfolio_db mysql -uportfolio_user -p"$(grep ^MYSQL_PASSWORD /root/financial-system/.env | cut -d= -f2)" portfolio'

# Run a one-shot query
ssh -i ~/.ssh/vps_id_rsa root@31.97.22.150 \
  'docker exec portfolio_db sh -c "mysql -uroot -p\$MYSQL_ROOT_PASSWORD portfolio -e \"SELECT COUNT(*) FROM users;\""'
```

Credentials live in `/root/financial-system/.env` on the VPS (`MYSQL_ROOT_PASSWORD`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE=portfolio`).

### Tunnel the DB to localhost (optional)

If you want to use a GUI client locally:

```bash
# Forward VPS container port 3306 to local 3307
ssh -i ~/.ssh/vps_id_rsa -L 3307:172.17.0.1:3306 root@31.97.22.150
# Then on the VPS, expose the container port temporarily, or use docker exec instead.
```

Simpler: dump and pull.

```bash
ssh -i ~/.ssh/vps_id_rsa root@31.97.22.150 \
  'docker exec portfolio_db sh -c "mysqldump -uroot -p\$MYSQL_ROOT_PASSWORD portfolio"' \
  > prod_dump_$(date +%F).sql
```

### Backup / restore

```bash
# Backup
ssh -i ~/.ssh/vps_id_rsa root@31.97.22.150 \
  'docker exec portfolio_db sh -c "mysqldump -uroot -p\$MYSQL_ROOT_PASSWORD portfolio" | gzip' \
  > backup_$(date +%F).sql.gz

# Restore (DESTRUCTIVE — confirm first)
gunzip -c backup_YYYY-MM-DD.sql.gz | \
  ssh -i ~/.ssh/vps_id_rsa root@31.97.22.150 \
  'docker exec -i portfolio_db sh -c "mysql -uroot -p\$MYSQL_ROOT_PASSWORD portfolio"'
```

## Local dev

```bash
docker compose up                       # dev (base + override)
docker compose logs -f backend          # tail
docker exec -it portfolio_db mysql -uportfolio_user -pportfolio_pass portfolio
```

Migrations auto-run on backend startup (`entrypoint.sh` → `alembic upgrade head`). To create a new revision:

```bash
docker exec -it portfolio_api alembic revision --autogenerate -m "msg"
```
