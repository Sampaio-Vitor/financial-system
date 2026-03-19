# Logout Button Fix + User Registration

**Date:** 2026-03-19
**Status:** Brainstorm Complete

## What We're Building

Two improvements to the auth flow:

1. **Fix logout button visibility** - The "Sair" button exists in the sidebar code but is invisible because the sidebar stretches with page content, pushing the button below the viewport.

2. **User registration** - Allow anyone to create an account directly from the login page, with a toggle between "Entrar" and "Criar conta" on the same page.

## Why This Approach

### Sidebar Fix

The sidebar currently uses `min-h-screen` with `flex-col`. Due to flexbox's default `align-items: stretch`, when the main content is taller than the viewport, the sidebar stretches with it. The `flex-1` nav absorbs the extra space, pushing the logout button far below the visible area.

**Fix:** Change sidebar to `h-screen sticky top-0` so it stays fixed to viewport height and sticks when scrolling. The logout button will always be visible at the bottom.

### Registration

Simple registration flow on the same login page:
- **Backend:** New `POST /api/auth/register` endpoint
- **Frontend:** Toggle/tab on login page between login and register modes
- No separate page, no email, no password confirmation - keep it minimal

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Registration access | Open to all | No admin-only restriction |
| Registration fields | Username + Password | Minimal, same as login |
| Password confirmation | No | Simpler UX |
| UX pattern | Toggle on login page | Same page, no navigation |
| Post-registration | Auto-login + redirect | Return JWT, go to `/carteira` |
| New user data | Empty portfolio | User adds assets manually |
| Sidebar fix | `h-screen sticky top-0` | Keeps logout always visible |

## Scope

### Backend
- Add `RegisterRequest` schema (username + password)
- Add `POST /api/auth/register` endpoint
- Validate username uniqueness (return 409 if taken)
- Create User + UserSettings with defaults
- Return JWT token

### Frontend
- Fix sidebar: `h-screen sticky top-0` + overflow-y-auto on nav
- Login page: Add toggle state (login/register)
- Register mode: Same form but with "Criar conta" button
- Handle registration errors (username taken, etc.)

## Open Questions

None - all decisions resolved.
