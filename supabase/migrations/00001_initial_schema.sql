-- ═══════════════════════════════════════════════════════════════════════════
-- Market Direction Engine — initial schema
--
-- Conventions:
--   * as_of       = the effective timestamp of the data as reported by the
--                   vendor (what the data claims to be true "as of").
--   * ingested_at = when we wrote the row. Both are required on every stored
--                   datapoint for auditability and point-in-time backtesting.
--   * Raw AND adjusted OHLCV are stored side by side; adjustment method is
--     documented in corporate_actions + the ingestion code, never implicit.
--   * RLS is enabled on every table with NO anon/authenticated policies:
--     deny-by-default. GitHub Actions jobs and Next.js server routes use the
--     service-role key, which bypasses RLS. Add explicit read policies later
--     if the client ever queries Supabase directly.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Reference data ───────────────────────────────────────────────────────────

create table instruments (
  id              bigint generated always as identity primary key,
  symbol          text not null,
  name            text,
  instrument_type text not null check (instrument_type in
                    ('index','equity','etf','future','currency','commodity','rate')),
  exchange        text not null default '',
  currency        text,
  is_active       boolean not null default true,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  unique (symbol, exchange)
);

-- Point-in-time index membership: a constituent's row is "open" while
-- valid_to is null. Rebalances close the old row and open a new one, so
-- historical queries never suffer survivorship bias.
create table index_membership (
  id              bigint generated always as identity primary key,
  index_id        bigint not null references instruments (id),
  constituent_id  bigint not null references instruments (id),
  weight          numeric,
  valid_from      date not null,
  valid_to        date,
  source          text not null,
  as_of           timestamptz not null,
  ingested_at     timestamptz not null default now(),
  unique (index_id, constituent_id, valid_from)
);
create index idx_membership_index_valid on index_membership (index_id, valid_from, valid_to);

create table corporate_actions (
  id                bigint generated always as identity primary key,
  instrument_id     bigint not null references instruments (id),
  action_type       text not null check (action_type in ('split','dividend')),
  ex_date           date not null,
  split_numerator   numeric,   -- e.g. 4-for-1 split: numerator 4, denominator 1
  split_denominator numeric,
  dividend_amount   numeric,
  currency          text,
  source            text not null,
  as_of             timestamptz not null,
  ingested_at       timestamptz not null default now(),
  unique (instrument_id, action_type, ex_date)
);

-- ── Price data (raw + adjusted, daily + weekly) ─────────────────────────────

create table ohlcv_daily (
  instrument_id bigint not null references instruments (id),
  trade_date    date not null,
  open          numeric, high numeric, low numeric, close numeric,
  volume        bigint,
  adj_open      numeric, adj_high numeric, adj_low numeric, adj_close numeric,
  adj_volume    bigint,
  source        text not null,
  as_of         timestamptz not null,
  ingested_at   timestamptz not null default now(),
  primary key (instrument_id, trade_date)
);
create index idx_ohlcv_daily_date on ohlcv_daily (trade_date);

-- Weekly bars keyed on week_end (the last trading day of the week, normally
-- Friday). week_start records the actual first trading day rolled up.
create table ohlcv_weekly (
  instrument_id bigint not null references instruments (id),
  week_end      date not null,
  week_start    date not null,
  open          numeric, high numeric, low numeric, close numeric,
  volume        bigint,
  adj_open      numeric, adj_high numeric, adj_low numeric, adj_close numeric,
  adj_volume    bigint,
  source        text not null,
  as_of         timestamptz not null,
  ingested_at   timestamptz not null default now(),
  primary key (instrument_id, week_end)
);

-- ── Layer 2: per-constituent weekly technicals ───────────────────────────────

create table technical_snapshots (
  instrument_id     bigint not null references instruments (id),
  week_end          date not null,
  -- momentum / oscillators
  rsi_14            numeric,
  rsi_divergence    text check (rsi_divergence in ('bullish','bearish')),
  macd              numeric, macd_signal numeric, macd_hist numeric,
  -- bollinger (20, 2σ)
  bb_upper          numeric, bb_mid numeric, bb_lower numeric,
  bb_pct_b          numeric, bb_bandwidth numeric,
  bb_squeeze        boolean,
  bb_band_walk      text check (bb_band_walk in ('upper','lower')),
  -- volume
  obv               numeric,
  ad_line           numeric,
  volume_vs_20w     numeric,   -- ratio of this week's volume to 20-week average
  volume_confirms   boolean,
  -- moving averages (weekly institutional 30w/40w ≈ 150d/200d)
  ma_30w            numeric, ma_40w numeric,
  ma_30w_slope      numeric, ma_40w_slope numeric,
  price_vs_ma_30w   numeric,   -- close / ma - 1
  price_vs_ma_40w   numeric,
  ma_cross          text check (ma_cross in ('golden','death')),
  -- trend strength
  adx_14            numeric, di_plus numeric, di_minus numeric,
  -- relative strength vs own index (Mansfield RS)
  mansfield_rs      numeric,
  rs_trend          text check (rs_trend in ('leading','lagging','neutral')),
  -- range / volatility
  pos_52w_range     numeric,   -- 0 = at 52w low, 1 = at 52w high
  atr_14            numeric,
  support           numeric, resistance numeric,
  -- composite
  composite_score   numeric,
  weights_version   text,
  extras            jsonb not null default '{}',
  computed_at       timestamptz not null default now(),
  primary key (instrument_id, week_end)
);

-- ── Layer 1 inputs: breadth (per index, daily) ───────────────────────────────

create table breadth_metrics (
  index_id           bigint not null references instruments (id),
  metric_date        date not null,
  advancers          integer, decliners integer, unchanged integer,
  adv_dec_line       numeric,
  adv_dec_ratio      numeric,
  pct_above_50d      numeric,
  pct_above_200d     numeric,
  new_highs_52w      integer, new_lows_52w integer,
  high_low_index     numeric,
  mcclellan_osc      numeric,
  mcclellan_sum      numeric,
  up_volume          bigint, down_volume bigint,
  bullish_pct_index  numeric,
  breadth_divergence boolean,   -- index at/near highs while internals deteriorate
  extras             jsonb not null default '{}',
  as_of              timestamptz not null,
  ingested_at        timestamptz not null default now(),
  primary key (index_id, metric_date)
);

-- ── Macro / rates / positioning ──────────────────────────────────────────────

create table macro_series (
  id          bigint generated always as identity primary key,
  series_code text not null unique,          -- e.g. FRED:T10Y2Y, ONS:D7G7
  source      text not null,                 -- fred | bls | ons | boe | cftc | ...
  name        text not null,
  country     text,
  frequency   text,                          -- daily | weekly | monthly | quarterly
  units       text,
  lead_lag    text check (lead_lag in ('leading','coincident','lagging')),
  metadata    jsonb not null default '{}'
);

-- Vintaged observations: the same obs_date can appear with multiple as_of
-- values (data revisions). Backtests must select the vintage available at
-- the simulated point in time — this is the look-ahead guard for macro data.
create table macro_observations (
  series_id   bigint not null references macro_series (id),
  obs_date    date not null,
  value       numeric,
  as_of       timestamptz not null,
  ingested_at timestamptz not null default now(),
  primary key (series_id, obs_date, as_of)
);

create table economic_events (
  id          bigint generated always as identity primary key,
  country     text not null,
  event_name  text not null,
  release_at  timestamptz not null,
  period      text,                          -- e.g. "Jun 2026"
  importance  text check (importance in ('low','medium','high')),
  consensus   numeric,
  previous    numeric,
  actual      numeric,
  unit        text,
  source      text not null,
  as_of       timestamptz not null,
  ingested_at timestamptz not null default now(),
  unique (source, country, event_name, release_at)
);
create index idx_events_release on economic_events (release_at);

-- ── Sentiment / narrative ────────────────────────────────────────────────────

-- One row per scored reading. Headlines/metadata only in `detail` —
-- never full article text (licensing guardrail).
create table sentiment_readings (
  id            bigint generated always as identity primary key,
  scope_type    text not null check (scope_type in
                  ('index','instrument','sector','theme','market')),
  scope_key     text not null,               -- e.g. SPX, AAPL, theme:inflation
  source        text not null,               -- gdelt | rss | reddit | stocktwits | av_news | aaii | naaim | pcr | cot
  model_version text,                        -- e.g. finbert-tone@1 when model-scored
  reading_at    timestamptz not null,
  score         numeric,                     -- normalised -1..+1 where possible
  volume        integer,                     -- mentions / messages / articles
  detail        jsonb not null default '{}', -- headline, url, raw fields
  as_of         timestamptz not null,
  ingested_at   timestamptz not null default now()
);
create index idx_sentiment_scope_time on sentiment_readings (scope_type, scope_key, reading_at);

-- ── Layer 1 output: regime scores ────────────────────────────────────────────

create table regime_scores (
  index_id           bigint not null references instruments (id),
  as_of_date         date not null,
  trend_score        numeric,
  breadth_score      numeric,
  intermarket_score  numeric,
  positioning_score  numeric,
  narrative_score    numeric,   -- kept separate: noisiest input, separately weighted
  composite_score    numeric not null,
  regime             text not null check (regime in ('risk_on','neutral','risk_off')),
  confidence         numeric not null,
  weights_version    text not null,
  breakdown          jsonb not null default '{}',  -- full input decomposition
  computed_at        timestamptz not null default now(),
  primary key (index_id, as_of_date, weights_version)
);

-- ── Layer 3 output: signals ──────────────────────────────────────────────────

create table signals (
  id              bigint generated always as identity primary key,
  instrument_id   bigint not null references instruments (id),
  index_id        bigint not null references instruments (id),
  as_of_date      date not null,
  horizon         text not null default '2-6w',
  direction       text not null check (direction in ('bullish','neutral','bearish')),
  conviction      numeric not null,
  composite_score numeric not null,
  sub_scores      jsonb not null,             -- exact sub-score breakdown (traceability)
  gated           boolean not null default false,
  gate_reason     text,                        -- e.g. "regime risk_off blocks longs"
  event_blackout  boolean not null default false,
  upcoming_events jsonb not null default '[]',
  weights_version text not null,
  computed_at     timestamptz not null default now(),
  unique (instrument_id, as_of_date, weights_version)
);
create index idx_signals_asof on signals (as_of_date, index_id);

-- ── Config: versioned weights (no magic numbers in code) ────────────────────

create table weights_versions (
  version    text primary key,               -- e.g. v1, v2-narrative-downweighted
  weights    jsonb not null,                 -- all layers' weights + thresholds
  notes      text,
  created_at timestamptz not null default now()
);

-- ── Layer 4: validation ──────────────────────────────────────────────────────

create table backtest_runs (
  id              bigint generated always as identity primary key,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running'
                    check (status in ('running','success','error')),
  weights_version text not null,
  period_start    date not null,
  period_end      date not null,
  config          jsonb not null default '{}',
  notes           text
);

create table backtest_results (
  id                bigint generated always as identity primary key,
  run_id            bigint not null references backtest_runs (id),
  segment_type      text not null check (segment_type in
                      ('overall','signal_type','regime','index','out_of_sample','walk_forward')),
  segment_key       text not null,
  n_signals         integer,
  hit_rate          numeric,
  avg_fwd_return_2w numeric,
  avg_fwd_return_4w numeric,
  avg_fwd_return_6w numeric,
  expectancy        numeric,
  profit_factor     numeric,
  max_drawdown      numeric,
  detail            jsonb not null default '{}'
);

-- ── Ops: ingestion audit + staleness ─────────────────────────────────────────

create table ingestion_runs (
  id           bigint generated always as identity primary key,
  job_name     text not null,                -- e.g. ohlcv-daily, sentiment-rss
  provider     text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running'
                 check (status in ('running','success','partial','error')),
  rows_written integer not null default 0,
  error        text,
  detail       jsonb not null default '{}'
);
create index idx_ingestion_job_time on ingestion_runs (job_name, started_at desc);

-- ── Row Level Security: deny-by-default on everything ────────────────────────

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
