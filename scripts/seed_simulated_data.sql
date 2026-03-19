-- ============================================================
-- Seed: Dados simulados de compra/venda e reserva
-- Simula DCA mensal de jun/2025 a fev/2026
-- user_id = 1
-- ============================================================

-- ── Limpar snapshots antigos (serao regenerados) ──
DELETE FROM monthly_snapshots WHERE user_id = 1;

-- ============================================================
-- COMPRAS: US STOCKS (precos em USD, convertidos na hora)
-- Simulando aportes mensais
-- ============================================================

-- Jun/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(1,  1, '2025-06-10', 2,  956.50, 1913.00, NOW()),   -- AAPL
(4,  1, '2025-06-10', 1,  940.00,  940.00, NOW()),   -- AMZN
(12, 1, '2025-06-12', 3,  870.00, 2610.00, NOW()),   -- GOOGL
(19, 1, '2025-06-15', 5,  870.00, 4350.00, NOW());   -- PG

-- Jul/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(16, 1, '2025-07-08', 1, 2650.00, 2650.00, NOW()),   -- MA
(28, 1, '2025-07-08', 3,  960.00, 2880.00, NOW()),   -- TXN
(1,  1, '2025-07-15', 1,  980.00,  980.00, NOW()),   -- AAPL
(26, 1, '2025-07-20', 3,  640.00, 1920.00, NOW());   -- TJX

-- Ago/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(4,  1, '2025-08-05', 1,  960.00,  960.00, NOW()),   -- AMZN
(12, 1, '2025-08-05', 2,  850.00, 1700.00, NOW()),   -- GOOGL
(15, 1, '2025-08-12', 10, 370.00, 3700.00, NOW()),   -- KO
(14, 1, '2025-08-20', 3,  830.00, 2490.00, NOW());   -- JNJ

-- Set/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(1,  1, '2025-09-03', 1, 1160.00, 1160.00, NOW()),   -- AAPL
(19, 1, '2025-09-10', 3,  890.00, 2670.00, NOW()),   -- PG
(24, 1, '2025-09-15', 1, 1990.00, 1990.00, NOW()),   -- SHW
(29, 1, '2025-09-22', 5, 1250.00, 6250.00, NOW());   -- VEEV

-- Out/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(16, 1, '2025-10-07', 1, 2700.00, 2700.00, NOW()),   -- MA
(28, 1, '2025-10-07', 2,  980.00, 1960.00, NOW()),   -- TXN
(4,  1, '2025-10-14', 1,  970.00,  970.00, NOW()),   -- AMZN
(13, 1, '2025-10-20', 1, 2600.00, 2600.00, NOW());   -- ISRG

-- Nov/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(1,  1, '2025-11-05', 1, 1200.00, 1200.00, NOW()),   -- AAPL
(12, 1, '2025-11-10', 2,  900.00, 1800.00, NOW()),   -- GOOGL
(26, 1, '2025-11-15', 3,  660.00, 1980.00, NOW()),   -- TJX
(15, 1, '2025-11-20', 5,  380.00, 1900.00, NOW());   -- KO

-- Dez/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(19, 1, '2025-12-05', 3,  910.00, 2730.00, NOW()),   -- PG
(16, 1, '2025-12-10', 1, 2800.00, 2800.00, NOW()),   -- MA
(14, 1, '2025-12-15', 2,  850.00, 1700.00, NOW()),   -- JNJ
(29, 1, '2025-12-20', 3, 1280.00, 3840.00, NOW());   -- VEEV

-- Jan/2026
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(1,  1, '2026-01-08', 1, 1250.00, 1250.00, NOW()),   -- AAPL
(4,  1, '2026-01-08', 1, 1000.00, 1000.00, NOW()),   -- AMZN
(28, 1, '2026-01-15', 2, 1010.00, 2020.00, NOW()),   -- TXN
(13, 1, '2026-01-22', 1, 2700.00, 2700.00, NOW());   -- ISRG

-- Fev/2026
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(12, 1, '2026-02-05', 2,  920.00, 1840.00, NOW()),   -- GOOGL
(16, 1, '2026-02-10', 1, 2850.00, 2850.00, NOW()),   -- MA
(24, 1, '2026-02-15', 1, 2050.00, 2050.00, NOW()),   -- SHW
(26, 1, '2026-02-20', 2,  680.00, 1360.00, NOW());   -- TJX

-- ============================================================
-- COMPRAS: ACOES BR (precos em BRL)
-- ============================================================

-- Jun/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(33, 1, '2025-06-10', 50, 26.50, 1325.00, NOW()),   -- BBAS3
(43, 1, '2025-06-10', 100, 10.20, 1020.00, NOW()),  -- ITSA3
(57, 1, '2025-06-12', 30, 62.00, 1860.00, NOW()),   -- VALE3
(60, 1, '2025-06-15', 40, 52.00, 2080.00, NOW());   -- WEGE3

-- Jul/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(48, 1, '2025-07-08', 50, 38.50, 1925.00, NOW()),   -- PETR3
(39, 1, '2025-07-10', 30, 43.00, 1290.00, NOW()),   -- EGIE3
(56, 1, '2025-07-15', 20, 32.00, 640.00, NOW()),    -- TOTS3
(51, 1, '2025-07-20', 30, 27.00, 810.00, NOW());    -- RADL3

-- Ago/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(33, 1, '2025-08-05', 40, 27.00, 1080.00, NOW()),   -- BBAS3
(57, 1, '2025-08-10', 20, 64.00, 1280.00, NOW()),   -- VALE3
(55, 1, '2025-08-15', 50, 18.50, 925.00, NOW()),    -- TIMS3
(44, 1, '2025-08-20', 80, 35.00, 2800.00, NOW());   -- ITUB3

-- Set/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(43, 1, '2025-09-05', 80, 10.50, 840.00, NOW()),    -- ITSA3
(60, 1, '2025-09-10', 30, 54.00, 1620.00, NOW()),   -- WEGE3
(48, 1, '2025-09-15', 30, 39.50, 1185.00, NOW()),   -- PETR3
(53, 1, '2025-09-20', 20, 90.00, 1800.00, NOW());   -- SBSP3

-- Out/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(33, 1, '2025-10-08', 30, 28.00, 840.00, NOW()),    -- BBAS3
(39, 1, '2025-10-10', 20, 44.00, 880.00, NOW()),    -- EGIE3
(57, 1, '2025-10-15', 15, 65.00, 975.00, NOW()),    -- VALE3
(56, 1, '2025-10-20', 15, 33.00, 495.00, NOW());    -- TOTS3

-- Nov/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(44, 1, '2025-11-05', 60, 36.00, 2160.00, NOW()),   -- ITUB3
(48, 1, '2025-11-10', 30, 40.00, 1200.00, NOW()),   -- PETR3
(60, 1, '2025-11-15', 20, 56.00, 1120.00, NOW()),   -- WEGE3
(51, 1, '2025-11-20', 20, 28.00, 560.00, NOW());    -- RADL3

-- Dez/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(43, 1, '2025-12-05', 70, 11.00, 770.00, NOW()),    -- ITSA3
(33, 1, '2025-12-10', 20, 29.00, 580.00, NOW()),    -- BBAS3
(53, 1, '2025-12-15', 15, 92.00, 1380.00, NOW()),   -- SBSP3
(55, 1, '2025-12-20', 30, 19.00, 570.00, NOW());    -- TIMS3

-- Jan/2026
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(57, 1, '2026-01-08', 20, 58.00, 1160.00, NOW()),   -- VALE3
(60, 1, '2026-01-12', 25, 58.00, 1450.00, NOW()),   -- WEGE3
(44, 1, '2026-01-18', 50, 37.00, 1850.00, NOW()),   -- ITUB3
(48, 1, '2026-01-25', 25, 41.00, 1025.00, NOW());   -- PETR3

-- Fev/2026
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(33, 1, '2026-02-05', 25, 30.00, 750.00, NOW()),    -- BBAS3
(39, 1, '2026-02-10', 20, 46.00, 920.00, NOW()),    -- EGIE3
(43, 1, '2026-02-15', 60, 11.50, 690.00, NOW()),    -- ITSA3
(56, 1, '2026-02-20', 20, 35.00, 700.00, NOW());    -- TOTS3

-- ============================================================
-- COMPRAS: FIIs (precos em BRL)
-- ============================================================

-- Jun/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(65, 1, '2025-06-10', 20, 155.00, 3100.00, NOW()),  -- HGLG11
(66, 1, '2025-06-12', 15, 128.00, 1920.00, NOW()),  -- HGRU11
(67, 1, '2025-06-15', 10, 150.00, 1500.00, NOW());  -- KNRI11

-- Ago/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(61, 1, '2025-08-08', 100, 10.50, 1050.00, NOW()),  -- ALZR11
(63, 1, '2025-08-12', 10, 102.00, 1020.00, NOW()),  -- BTLG11
(68, 1, '2025-08-18', 20, 85.00, 1700.00, NOW());   -- KNSC11

-- Out/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(65, 1, '2025-10-07', 10, 158.00, 1580.00, NOW()),  -- HGLG11
(64, 1, '2025-10-14', 8, 195.00, 1560.00, NOW()),   -- HGBS11
(70, 1, '2025-10-20', 10, 96.00, 960.00, NOW());    -- XPLG11

-- Dez/2025
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(66, 1, '2025-12-05', 10, 130.00, 1300.00, NOW()),  -- HGRU11
(67, 1, '2025-12-12', 8, 152.00, 1216.00, NOW()),   -- KNRI11
(69, 1, '2025-12-18', 15, 90.00, 1350.00, NOW());   -- RZTR11

-- Fev/2026
INSERT INTO purchases (asset_id, user_id, purchase_date, quantity, unit_price, total_value, created_at) VALUES
(61, 1, '2026-02-06', 80, 10.80, 864.00, NOW()),    -- ALZR11
(65, 1, '2026-02-12', 8, 160.00, 1280.00, NOW()),   -- HGLG11
(70, 1, '2026-02-18', 12, 98.00, 1176.00, NOW());   -- XPLG11

-- ============================================================
-- FIXED INCOME: mais uma posicao antiga
-- ============================================================

INSERT INTO fixed_income_positions (asset_id, user_id, description, start_date, applied_value, current_balance, yield_value, yield_pct, maturity_date, created_at, updated_at) VALUES
(72, 1, 'Tesouro Selic 2029', '2025-06-15', 15000.0000, 15850.0000, 850.0000, 0.056667, '2029-03-01', NOW(), NOW()),
(73, 1, 'Tesouro IPCA+ 2035', '2025-07-20', 20000.0000, 21200.0000, 1200.0000, 0.060000, '2035-05-15', NOW(), NOW());

-- ============================================================
-- FINANCIAL RESERVE: entradas mensais
-- ============================================================

INSERT INTO financial_reserve_entries (user_id, amount, note, recorded_at) VALUES
(1, 15000.00, 'Reserva inicial', '2025-06-15 00:00:00'),
(1, 18000.00, 'Deposito mensal', '2025-07-15 00:00:00'),
(1, 20000.00, 'Deposito mensal', '2025-08-15 00:00:00'),
(1, 22500.00, 'Deposito mensal', '2025-09-15 00:00:00'),
(1, 25000.00, 'Deposito mensal', '2025-10-15 00:00:00'),
(1, 27000.00, 'Deposito mensal', '2025-11-15 00:00:00'),
(1, 30000.00, 'Deposito mensal + bonus', '2025-12-20 00:00:00'),
(1, 32000.00, 'Deposito mensal', '2026-01-15 00:00:00'),
(1, 35000.00, 'Deposito mensal', '2026-02-15 00:00:00');

-- ============================================================
-- FIXED INCOME REDEMPTIONS: um resgate simulado
-- ============================================================

INSERT INTO fixed_income_redemptions (user_id, fixed_income_id, ticker, description, redemption_date, amount, created_at) VALUES
(1, 2, 'LCI', 'Resgate parcial LCI Liquidez', '2026-01-15', 10000.0000, NOW());
