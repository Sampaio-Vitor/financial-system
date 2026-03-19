---
title: "feat: Fix logout button + add user registration"
type: feat
status: completed
date: 2026-03-19
origin: docs/brainstorms/2026-03-19-logout-e-registro-brainstorm.md
---

# Fix Logout Button + Add User Registration

## Overview

Two auth improvements: (1) fix the invisible logout button in the sidebar, and (2) add public user registration with anti-bot protection on the login page.

## Problem Statement

1. **Logout button invisible**: The sidebar uses `min-h-screen` + flexbox. When main content exceeds viewport height, flexbox `align-items: stretch` stretches the sidebar, and `flex-1` on `<nav>` absorbs the extra space, pushing the "Sair" button below the fold.

2. **No user registration**: Users can only be created via `scripts/seed_user.py`. There's no way to create accounts from the UI.

3. **No anti-bot protection**: Auth endpoints have no rate limiting or CAPTCHA, making them vulnerable to brute force and spam.

## Proposed Solution

### Phase 1: Fix Sidebar Logout Button

**File:** `frontend/src/components/sidebar.tsx`

Change the sidebar from `min-h-screen` to `h-screen sticky top-0`. Add `overflow-y-auto` to the nav section so it scrolls independently. The logout button stays fixed at the bottom.

```tsx
// sidebar.tsx - aside element
<aside className={`h-screen sticky top-0 bg-[var(--color-bg-sidebar)] border-r border-[var(--color-border)] flex flex-col ...`}>

// nav element - add overflow-y-auto
<nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">

// logout div stays as-is (already at bottom of flex-col)
```

### Phase 2: Registration Backend

**File:** `backend/app/schemas/auth.py` - Add `RegisterRequest`

```python
class RegisterRequest(BaseModel):
    username: str
    password: str
```

**File:** `backend/app/routers/auth.py` - Add `POST /api/auth/register`

```python
@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Validate username: 3-30 chars, alphanumeric + underscore
    # Validate password: 6-72 chars (bcrypt limit)
    # Check username uniqueness (case-insensitive)
    # Create User + UserSettings in same transaction (flush + commit)
    # Return JWT token (auto-login)
```

Key details:
- Username: 3-30 chars, `^[a-zA-Z0-9_]+$`, case-insensitive uniqueness check
- Password: 6-72 chars (bcrypt limit), no complexity requirements
- 409 Conflict if username taken (specific error message - this is a personal app, not high-security)
- User + UserSettings created atomically (SQLAlchemy session handles transaction - both inserts in same session, single `commit()`)
- Returns JWT token so user is auto-logged in

### Phase 3: Registration Frontend

**File:** `frontend/src/app/login/page.tsx` - Add toggle between login/register

- Add `mode` state: `"login" | "register"`
- Toggle link below submit button:
  - Login mode: "Nao tem conta? **Criar conta**"
  - Register mode: "Ja tem conta? **Entrar**"
- Submit button label: "Entrar" / "Criar conta"
- Loading label: "Entrando..." / "Criando conta..."
- Form fields preserved when toggling (username + password stay filled)

**File:** `frontend/src/lib/auth.ts` - Add `register` function to AuthContext

```typescript
interface AuthContextType {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}
```

The `register` function calls `POST /api/auth/register`, stores token, sets `isAuthenticated = true`. Same flow as `login` but different endpoint.

### Phase 4: Rate Limiting + CAPTCHA

#### Rate Limiting (Backend)

**Library:** `slowapi` (free, in-memory, built on `limits`)

**File:** `backend/app/main.py` - Setup slowapi

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

**File:** `backend/app/routers/auth.py` - Apply limits

```python
@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, ...):

@router.post("/register")
@limiter.limit("5/minute")
async def register(request: Request, ...):
```

- Login: 10 requests/minute per IP
- Register: 5 requests/minute per IP (stricter - registration spam is worse)
- Returns HTTP 429 with message: "Muitas tentativas. Tente novamente em alguns minutos."
- In-memory storage (resets on server restart - acceptable for this app)

#### CAPTCHA (Frontend + Backend)

**Library:** Cloudflare Turnstile (free tier, privacy-friendly, no puzzles)

**How it works:**
1. Frontend loads Turnstile widget on login page
2. User solves invisible challenge (usually automatic, no interaction needed)
3. Frontend sends `cf-turnstile-response` token with login/register request
4. Backend verifies token with Cloudflare API before processing

**Frontend changes** (`frontend/src/app/login/page.tsx`):
- Add Turnstile script tag
- Add `<div class="cf-turnstile" data-sitekey="...">` to form
- Include token in request body

**Backend changes** (`backend/app/routers/auth.py`):
- Add Turnstile token verification before login/register logic
- Call `https://challenges.cloudflare.com/turnstile/v0/siteverify` with secret key
- Reject request if verification fails

**Config** (`backend/app/config.py`):
```python
TURNSTILE_SECRET_KEY: str = ""  # Empty = skip verification (dev mode)
```

When `TURNSTILE_SECRET_KEY` is empty, skip CAPTCHA verification (for local development).

**Frontend config** (`frontend/.env`):
```
NEXT_PUBLIC_TURNSTILE_SITE_KEY=  # Empty = hide widget (dev mode)
```

## Acceptance Criteria

- [x] Logout "Sair" button is always visible at the bottom of the sidebar
- [x] Sidebar nav section scrolls independently when items overflow
- [x] Collapsed sidebar also shows logout button correctly
- [x] User can toggle between "Entrar" and "Criar conta" on login page
- [x] Registration creates User + UserSettings atomically
- [x] Registration returns JWT and auto-redirects to `/carteira`
- [x] Username validation: 3-30 chars, alphanumeric + underscore
- [x] Password validation: 6-72 chars
- [x] Duplicate username returns 409 with clear error message
- [x] Rate limiting: 10/min login, 5/min register (per IP)
- [x] Rate limit exceeded returns 429 with Portuguese error message
- [x] Cloudflare Turnstile CAPTCHA on login page (skippable in dev)
- [x] Frontend shows appropriate error messages for all failure cases

## Implementation Order

```
1. Sidebar fix (5 min, zero risk, immediate value)
2. Backend: RegisterRequest schema + register endpoint
3. Backend: slowapi rate limiting on login + register
4. Backend: Turnstile verification (optional, config-driven)
5. Frontend: auth context register function
6. Frontend: login page toggle UI
7. Frontend: Turnstile widget
8. Frontend: rate limit + validation error handling
```

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/components/sidebar.tsx` | `h-screen sticky top-0`, nav `overflow-y-auto` |
| `backend/app/schemas/auth.py` | Add `RegisterRequest` |
| `backend/app/routers/auth.py` | Add register endpoint, rate limits, Turnstile verify |
| `backend/app/main.py` | Setup slowapi limiter |
| `backend/app/config.py` | Add `TURNSTILE_SECRET_KEY` |
| `frontend/src/lib/auth.ts` | Add `register` to AuthContext |
| `frontend/src/app/login/page.tsx` | Toggle UI, Turnstile widget, error handling |
| `backend/requirements.txt` | Add `slowapi` |
| `.env.example` | Add Turnstile keys |

## Dependencies

- `slowapi` (pip) - rate limiting for FastAPI
- Cloudflare Turnstile (free account) - CAPTCHA widget

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-03-19-logout-e-registro-brainstorm.md](../brainstorms/2026-03-19-logout-e-registro-brainstorm.md)
- Existing auth patterns: `backend/app/routers/auth.py`, `backend/app/services/auth_service.py`
- User creation pattern: `backend/scripts/seed_user.py` (flush + commit in same session)
- Login page styling: `frontend/src/app/login/page.tsx`
- Cloudflare Turnstile docs: https://developers.cloudflare.com/turnstile/
- slowapi docs: https://github.com/laurents/slowapi
