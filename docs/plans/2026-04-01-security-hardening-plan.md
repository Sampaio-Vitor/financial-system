---
title: "sec: Repository security hardening plan"
type: sec
status: active
date: 2026-04-01
origin: internal security audit
---

# sec: Repository Security Hardening Plan

## Overview

This document turns the April 1, 2026 repository security audit into an execution plan.

Goal: reduce the highest-risk issues first without breaking the current product flow.

## Executive Summary

The most serious issues found are:

1. Admin privilege is derived from `user.id == 1`, which is unsafe for a fresh database.
2. Any linked user can mutate global shared asset metadata.
3. JWT session tokens are stored in `localStorage`, which makes XSS materially worse.
4. Auth protections are too soft in production posture: optional CAPTCHA, weak proxy-aware rate limiting, and missing hardening headers.
5. Any authenticated user can trigger global price refreshes.
6. Frontend dependencies currently include known vulnerabilities.

## Findings

| Priority | Finding | Risk | Main References |
|---|---|---|---|
| P0 | Admin role based on `id == 1` | Privilege escalation / takeover on new DB | `backend/app/dependencies.py`, `frontend/src/lib/auth.tsx`, `backend/scripts/seed_user.py`, `.github/workflows/deploy.yml` |
| P0 | User can edit global asset fields | Cross-tenant integrity violation | `backend/app/routers/assets.py` |
| P1 | JWT in `localStorage` | Session theft if any XSS lands | `frontend/src/lib/auth.tsx`, `frontend/src/lib/api.ts` |
| P1 | Auth hardening incomplete | Brute force / abuse / weak perimeter | `backend/app/routers/auth.py`, `backend/app/limiter.py`, `backend/app/main.py`, `docker-compose.prod.yml`, `Caddyfile` |
| P1 | Global price update open to any user | Abuse / expensive shared side effects | `backend/app/routers/prices.py`, `backend/app/services/price_service.py` |
| P2 | Vulnerable frontend packages | Known supply-chain exposure | `frontend/package.json`, `package-lock.json` |
| P3 | FastAPI docs likely public in prod | Recon / attack surface disclosure | `backend/app/main.py` |

## Implementation Strategy

### Phase 1: Fix Broken Authorization

Scope:

- Replace implicit admin detection by `user.id == 1` with an explicit role flag or `is_admin` column.
- Remove frontend admin inference from decoded JWT payload alone.
- Restrict shared/global asset mutation.

Changes:

- Add `is_admin: bool` to `users`.
- Backfill existing intended admin user during migration or seed path.
- Change backend admin dependency to validate `user.is_admin`.
- Change frontend to rely on server-backed admin state, or include a signed admin claim issued by backend.
- Split asset fields into:
  - global fields: `ticker`, `description`, maybe `type`
  - user fields: `paused`
- Prevent non-admin users from editing global asset fields.

Acceptance criteria:

- A fresh database cannot promote the first self-registered user to admin accidentally.
- Admin-only routes reject non-admins even if they are user ID 1 or spoof a frontend state.
- Normal users can only mutate per-user asset settings.

### Phase 2: Session Hardening

Scope:

- Move auth away from browser-readable token storage.

Changes:

- Replace `localStorage` JWT storage with secure cookie-based auth:
  - `HttpOnly`
  - `Secure`
  - `SameSite=Lax` or stricter if flow allows
- Update backend auth endpoints to set/clear cookie.
- Update API client to stop reading token from `localStorage`.
- Keep bearer fallback only if there is a hard requirement, and isolate it.

Acceptance criteria:

- No auth token is readable through frontend JavaScript in the standard flow.
- Login, logout, protected routes, and 401 handling still work end-to-end.

### Phase 3: Auth and Perimeter Hardening

Scope:

- Make production auth controls actually production-safe.

Changes:

- Require Turnstile in production environments.
- Document `TURNSTILE_SECRET_KEY` in production env examples.
- Make rate limiting proxy-aware:
  - trust forwarded headers only from the reverse proxy path
  - ensure backend runs with proxy header support
- Add missing security headers:
  - `Content-Security-Policy`
  - `Strict-Transport-Security`
- Consider disabling or restricting `/docs`, `/redoc`, and `/openapi.json` in production.
- Remove duplicate rate-limit handler definition in `backend/app/main.py`.

Acceptance criteria:

- Login/register abuse is rate limited per real client IP behind Caddy.
- Production deploy requires CAPTCHA to be configured.
- Response headers include CSP and HSTS in production.

### Phase 4: Restrict Shared Side Effects

Scope:

- Remove globally impactful actions from all authenticated users.

Changes:

- Restrict `POST /api/prices/update` to admin, background jobs, or a dedicated internal path.
- Optionally add cooldown / task lock so concurrent refreshes do not pile up.
- Review any other route that mutates shared/global state.

Acceptance criteria:

- Regular users cannot trigger system-wide price updates.
- Price refresh path is bounded and operationally predictable.

### Phase 5: Dependency and Supply-Chain Cleanup

Scope:

- Eliminate currently known frontend vulnerabilities.

Changes:

- Upgrade `next` beyond `15.5.13`.
- Upgrade or replace `read-excel-file` chain so `@xmldom/xmldom` is no longer vulnerable.
- Re-run audit after lockfile refresh.

Acceptance criteria:

- `npm audit --omit=dev` returns no known moderate/high findings for production dependencies.

## Detailed Task List

### P0

- [ ] Add `is_admin` to user model and migration.
- [ ] Update `get_admin_user` to check `is_admin`.
- [ ] Remove `userId === 1` admin logic from frontend.
- [ ] Define safe admin bootstrap path for fresh environments.
- [ ] Lock down `PUT /api/assets/{asset_id}` so only per-user fields are editable by regular users.
- [ ] Decide whether global asset creation/editing is admin-only or service-managed.

### P1

- [ ] Move auth from `localStorage` to `HttpOnly` cookies.
- [ ] Add backend logout endpoint that clears cookie.
- [ ] Add CSP in backend or proxy layer.
- [ ] Add HSTS in proxy layer.
- [ ] Require Turnstile in production configuration.
- [ ] Make rate limiting honor real client IP behind proxy.
- [ ] Restrict `/api/prices/update`.
- [ ] Disable FastAPI docs in production.

### P2

- [ ] Upgrade `next`.
- [ ] Upgrade/remove vulnerable XML dependency path from spreadsheet import flow.
- [ ] Add dependency audit to CI.

### P3

- [ ] Review CORS policy for strict production defaults.
- [ ] Add a short operational runbook for required secrets and hardening toggles.
- [ ] Consider audit logging for admin actions and shared-data mutations.

## Proposed Execution Order

1. Phase 1: authorization fixes.
2. Phase 2: session hardening.
3. Phase 3: auth/perimeter hardening.
4. Phase 4: shared side-effect restriction.
5. Phase 5: dependency remediation.

## Verification Plan

After implementation, verify:

- Non-admin user cannot access `/api/admin/*`.
- Fresh database + first registration does not create an admin unless explicitly configured.
- Regular user cannot alter another user's effective asset metadata through shared asset records.
- Browser storage contains no long-lived auth token.
- Login/register are rate limited correctly behind Caddy.
- Production headers include CSP and HSTS.
- Non-admin user cannot run global price refresh.
- `npm audit --omit=dev` is clean enough for release policy.

## Notes

- The repository currently has enough structure to fix these issues incrementally without a rewrite.
- The correct next move is to start with Phase 1, because the current admin and global-asset model are actual authorization flaws, not just hardening gaps.
