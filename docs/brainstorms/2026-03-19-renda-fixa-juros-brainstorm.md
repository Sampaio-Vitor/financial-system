# Brainstorm: Registro de Juros em Renda Fixa

**Date:** 2026-03-19
**Status:** Draft

## What We're Building

A system to register monthly interest (juros) for fixed income positions, creating a historical record of balance changes. Today, users manually edit `current_balance` inline with no history. This feature adds:

1. **"Registrar Juros" button** on the Renda Fixa page - opens a bulk form listing all RF positions where the user enters the new balance for each. The system calculates the interest amount as the difference.
2. **Interest history in the timeline** - the existing "Aportes & Resgates" section becomes "Aportes, Resgates & Juros", with interest entries shown chronologically mixed in, using a "JUROS" badge.
3. **Reference month picker** - instead of a date field, the user picks a month/year (e.g. "Mar 2026"). The date is stored as the last day of that month.
4. **Overwrite support** - if interest is already registered for a position+month, it gets updated (upsert) rather than blocked.
5. **Dashboard integration** - interest amounts are included in the "Aportes do Mes" totals, and Renda Fixa gets its own separate tab in the detail drawer (not mixed with RV assets).

## Why This Approach

- **Bulk registration** fits the real workflow: at month's end, you check all RF positions and update balances at once
- **New balance input** (not interest amount) is more natural since users copy the saldo from their broker
- **Dedicated table** (not reusing redemptions) keeps semantics clean and queries simple
- **Reference month** instead of arbitrary date makes monthly aggregation trivial and prevents confusion
- **Including interest in aportes totals** gives an accurate picture of total capital growth per month

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Input method | User enters new total balance | Matches broker UX - just copy the number |
| Registration flow | Bulk (all positions at once) | Fits end-of-month workflow |
| Date handling | Reference month picker (stored as last day of month) | Clean monthly aggregation |
| Duplicate handling | Overwrite (upsert) | Flexible - user can correct mistakes |
| Timeline display | Mixed with aportes/resgates, "JUROS" badge | Single chronological view |
| DB storage | New `fixed_income_interest` table | Clean separation, full history |
| Dashboard aportes | Interest included in totals | Accurate capital growth picture |
| Dashboard detail drawer | Separate tab for Renda Fixa | RF doesn't fit with RV assets |

## Database Changes

### New table: `fixed_income_interest`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK AUTO_INCREMENT | |
| `user_id` | INT FK(users) | |
| `fixed_income_id` | INT | References `fixed_income_positions.id`. Nullable (set NULL if position deleted) |
| `ticker` | VARCHAR | Denormalized from asset at creation time |
| `description` | VARCHAR | Denormalized from position at creation time |
| `reference_month` | DATE | Last day of the reference month |
| `previous_balance` | DECIMAL(18,4) | Balance before interest |
| `new_balance` | DECIMAL(18,4) | Balance after interest |
| `interest_amount` | DECIMAL(18,4) | Calculated: new_balance - previous_balance |
| `created_at` | DATETIME | |

**Unique constraint:** `(fixed_income_id, reference_month)` - enables upsert behavior.

### Side effects on insert/update:
- Update `fixed_income_positions.current_balance` to `new_balance`
- Recalculate `yield_value` and `yield_pct` on the position

## API Changes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/fixed-income/interest` | Bulk register interest (array of {fixed_income_id, new_balance, reference_month}) |
| GET | `/api/fixed-income/interest` | List all interest history (for timeline) |
| DELETE | `/api/fixed-income/interest/{id}` | Delete an interest entry (reverts position balance to previous_balance) |

## Frontend Changes

### Renda Fixa page (`/carteira/renda-fixa`)
- Add "Registrar Juros" button next to existing "Registrar Aporte" / "Registrar Resgate"
- Modal: month picker + table of all positions with current balance and "Novo Saldo" input column
- Rename timeline section from "Aportes & Resgates" to "Aportes, Resgates & Juros"
- Add "JUROS" badge (new color) to interest entries in the timeline
- Interest entries show: date, badge, description, interest amount (with +R$ prefix)

### Mensal dashboard (`/carteira/mensal`)
- Include interest in "Aportes do Mes" summary card totals
- Detail drawer: add tabs (Renda Variavel | Renda Fixa) instead of mixing RF with RV
- Renda Fixa tab shows: Aportes RF, Resgates RF, Juros RF as separate groups

### Monthly overview API (`/api/portfolio/overview`)
- Add `fi_interest` array to `MonthlyOverview` schema
- Include interest sum in total aportes calculation

## Open Questions

None - all key decisions have been resolved through discussion.
