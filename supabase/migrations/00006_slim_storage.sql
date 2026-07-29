-- Free-tier storage reduction. The 500 MB cap was at 493 MB; an audit found
-- that ~32% of ohlcv_weekly and ~25% of ohlcv_daily was columns written by
-- every ingest and never read by any query.
--
-- Every read path (compute/technicals.ts, compute/breadth.ts, compute/regime.ts,
-- backtest/run.ts, data/queries.ts) selects the adj_* columns plus raw `volume`.
-- The raw open/high/low/close and adj_volume were write-only, as was week_start
-- (nothing reads it; the incremental rollup filter derives Monday in JS).
--
-- NOTE: dropping a column is metadata-only in Postgres — the bytes stay on disk
-- until the table is rewritten. scripts/shrink-db.ts does the physical reclaim
-- (export → drop → recreate via LIKE → reimport), which is why this migration
-- only has to declare the intended shape.

-- ── 1. Indexes that cost more than they earn ──────────────────────────────────
-- Real space, reclaimed the moment they are dropped (no rewrite needed).

-- 5 MB for 46 lifetime scans; every hot path filters by instrument_id first,
-- which the primary key already serves.
drop index if exists idx_ohlcv_daily_date;

-- corporate_actions has a surrogate `id` PK (1.1 MB, 1 lifetime scan) that is
-- redundant with the natural unique key it is always queried by. Nothing
-- references it with a foreign key.
alter table corporate_actions drop constraint if exists corporate_actions_pkey;

-- ── 2. Write-only columns ─────────────────────────────────────────────────────
-- `volume` stays: compute/technicals.ts reads it (vendor split-adjusted).

alter table ohlcv_weekly
  drop column if exists open,
  drop column if exists high,
  drop column if exists low,
  drop column if exists close,
  drop column if exists adj_volume,
  drop column if exists week_start;

alter table ohlcv_daily
  drop column if exists open,
  drop column if exists high,
  drop column if exists low,
  drop column if exists close,
  drop column if exists adj_volume;

comment on table ohlcv_weekly is
  'Weekly bars, dividend+split adjusted (adj_*). Raw prices were dropped in
   00006 as write-only; `volume` is the vendor split-adjusted raw volume.';
comment on table ohlcv_daily is
  'Daily bars, dividend+split adjusted (adj_*), retained per
   CONSTITUENT_DAILY_RETENTION_DAYS for breadth. Raw prices dropped in 00006.';
