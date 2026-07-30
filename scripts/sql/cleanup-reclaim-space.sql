-- ================================================================
-- DATABASE SPACE RECLAIM — Run in Supabase SQL Editor
-- ================================================================
-- Problem: 525 MB / 500 MB free-tier limit exceeded.
-- Strategy:
--   1. Delete ohlcv_daily equity rows older than 400 days (was 1095)
--   2. Delete technical_snapshots older than 52 weeks
--   3. Delete old index daily bars before 2020 (chart only needs recent)
--   4. VACUUM FULL the big tables to physically reclaim disk space
--
-- Expected savings: ~100-120 MB → brings DB to ~400-420 MB
-- ================================================================

-- ── Step 1: Preview what will be deleted (dry run) ──────────────

-- Daily bars to delete (equity only, older than 400 days)
SELECT 'ohlcv_daily equity prune' AS step,
       count(*) AS rows_to_delete,
       pg_size_pretty((count(*) * 224)::bigint) AS approx_savings
  FROM ohlcv_daily o
  JOIN instruments i ON i.id = o.instrument_id
 WHERE i.instrument_type = 'equity'
   AND o.trade_date < current_date - 400;

-- Old index daily bars (before 2020)
SELECT 'ohlcv_daily old index trim' AS step,
       count(*) AS rows_to_delete,
       pg_size_pretty((count(*) * 224)::bigint) AS approx_savings
  FROM ohlcv_daily o
  JOIN instruments i ON i.id = o.instrument_id
 WHERE i.instrument_type IN ('index', 'etf', 'future', 'currency')
   AND o.trade_date < '2020-01-01';

-- Old technical snapshots (older than 52 weeks)
SELECT 'technical_snapshots prune' AS step,
       count(*) AS rows_to_delete,
       pg_size_pretty((count(*) * 395)::bigint) AS approx_savings
  FROM technical_snapshots
 WHERE week_end < current_date - 364;


-- ── Step 2: Execute deletes ─────────────────────────────────────
-- Run these one block at a time.

-- 2a. Delete old equity daily bars
DELETE FROM ohlcv_daily o
 USING instruments i
 WHERE i.id = o.instrument_id
   AND i.instrument_type = 'equity'
   AND o.trade_date < current_date - 400;

-- 2b. Delete old index/etf/future daily bars before 2020
DELETE FROM ohlcv_daily o
 USING instruments i
 WHERE i.id = o.instrument_id
   AND i.instrument_type IN ('index', 'etf', 'future', 'currency')
   AND o.trade_date < '2020-01-01';

-- 2c. Delete old technical snapshots (keep 52 weeks)
DELETE FROM technical_snapshots
 WHERE week_end < current_date - 364;


-- ── Step 3: VACUUM FULL (reclaims physical disk space) ──────────
-- These acquire exclusive locks — run during low traffic.
-- Each takes 10-60 seconds depending on table size.

VACUUM FULL ohlcv_daily;
VACUUM FULL technical_snapshots;
VACUUM FULL ohlcv_weekly;


-- ── Step 4: Verify final sizes ──────────────────────────────────

SELECT c.relname,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
       c.reltuples::bigint AS est_rows
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND pg_total_relation_size(c.oid) > 100000
 ORDER BY pg_total_relation_size(c.oid) DESC;
