-- ============================================================
-- Seed: Mock interest data for testing juros-modal
-- Inserts interest entries for existing FI positions (user_id=1)
-- Leaves gaps so you can test registering past months
--
-- Scenario after running:
--   Position 1 (Tesouro Selic 2029, applied=15000):
--     - Oct 2025: 15000 -> 15200 (+200)
--     - Dec 2025: 15200 -> 15450 (+250)
--     - Feb 2026: 15450 -> 15850 (+400)  ← current_balance
--     (Nov 2025 and Jan 2026 are MISSING — test filling gaps)
--
--   Position 2 (Tesouro IPCA+ 2035, applied=20000):
--     - Oct 2025: 20000 -> 20350 (+350)
--     - Jan 2026: 20350 -> 21200 (+850)  ← current_balance
--     (Nov, Dec 2025 are MISSING — test filling gaps)
--
-- Test cases:
--   1. Open modal on Mar 2026 → Saldo Anterior = current Feb/Jan balances
--   2. Navigate to Nov 2025 → Saldo Anterior shows Oct new_balance (15200 / 20350)
--   3. Navigate to Oct 2025 → amber dot shows existing entry, input pre-filled
--   4. Navigate to Sep 2025 → Saldo Anterior falls back to applied_value
--   5. Register Nov 2025 → forward cascade updates Dec previous_balance
-- ============================================================

-- Clean existing interest entries for user 1
DELETE FROM fixed_income_interest WHERE user_id = 1;

-- Get position IDs (assuming seed_simulated_data.sql was run first)
-- Position 1: Tesouro Selic 2029 (asset_id=72)
-- Position 2: Tesouro IPCA+ 2035 (asset_id=73)

SET @pos1 = (SELECT id FROM fixed_income_positions WHERE user_id = 1 AND asset_id = 72 LIMIT 1);
SET @pos2 = (SELECT id FROM fixed_income_positions WHERE user_id = 1 AND asset_id = 73 LIMIT 1);

-- ── Position 1: Tesouro Selic 2029 ──

-- Oct 2025 (first entry — previous = applied_value)
INSERT INTO fixed_income_interest
  (user_id, fixed_income_id, ticker, description, reference_month, previous_balance, new_balance, interest_amount, created_at)
VALUES
  (1, @pos1, 'SELIC29', 'Tesouro Selic 2029', '2025-10-31', 15000.0000, 15200.0000, 200.0000, NOW());

-- Dec 2025 (skip Nov — gap for testing)
INSERT INTO fixed_income_interest
  (user_id, fixed_income_id, ticker, description, reference_month, previous_balance, new_balance, interest_amount, created_at)
VALUES
  (1, @pos1, 'SELIC29', 'Tesouro Selic 2029', '2025-12-31', 15200.0000, 15450.0000, 250.0000, NOW());

-- Feb 2026 (skip Jan — gap for testing)
INSERT INTO fixed_income_interest
  (user_id, fixed_income_id, ticker, description, reference_month, previous_balance, new_balance, interest_amount, created_at)
VALUES
  (1, @pos1, 'SELIC29', 'Tesouro Selic 2029', '2026-02-28', 15450.0000, 15850.0000, 400.0000, NOW());

-- ── Position 2: Tesouro IPCA+ 2035 ──

-- Oct 2025 (first entry)
INSERT INTO fixed_income_interest
  (user_id, fixed_income_id, ticker, description, reference_month, previous_balance, new_balance, interest_amount, created_at)
VALUES
  (1, @pos2, 'IPCA35', 'Tesouro IPCA+ 2035', '2025-10-31', 20000.0000, 20350.0000, 350.0000, NOW());

-- Jan 2026 (skip Nov+Dec — gap for testing)
INSERT INTO fixed_income_interest
  (user_id, fixed_income_id, ticker, description, reference_month, previous_balance, new_balance, interest_amount, created_at)
VALUES
  (1, @pos2, 'IPCA35', 'Tesouro IPCA+ 2035', '2026-01-31', 20350.0000, 21200.0000, 850.0000, NOW());

-- ── Update position current_balance to match latest interest entry ──
UPDATE fixed_income_positions SET current_balance = 15850.0000, yield_value = 850.0000, yield_pct = 0.056667 WHERE id = @pos1;
UPDATE fixed_income_positions SET current_balance = 21200.0000, yield_value = 1200.0000, yield_pct = 0.060000 WHERE id = @pos2;

-- Verify
SELECT 'Interest entries inserted:' AS info;
SELECT fi.id, fi.ticker, fi.description, fi.reference_month, fi.previous_balance, fi.new_balance, fi.interest_amount
FROM fixed_income_interest fi
WHERE fi.user_id = 1
ORDER BY fi.fixed_income_id, fi.reference_month;
