import { getPool } from "../db";
import {
  aggregateMonthly, computeOverlays, type ChartBar, type Timeframe,
} from "../compute/chart-overlays";

/**
 * Server-side read layer for the UI. All queries run in Next.js server
 * components/routes with the service connection; the client only ever
 * receives derived rows (licensing guardrail). Every result carries the
 * as_of/computed_at timestamps it was built from.
 */

export interface RegimeRow {
  index_id: number;
  symbol: string;
  name: string;
  as_of_date: string;
  trend_score: number | null;
  breadth_score: number | null;
  intermarket_score: number | null;
  positioning_score: number | null;
  narrative_score: number | null;
  composite_score: number;
  regime: string;
  confidence: number;
  breakdown: {
    inputs: Record<string, Record<string, unknown> | null>;
    coverage: number;
    gauge: {
      direction: string;
      intensity: number;
      evidence: Array<{ item: string; detail: string; weight: number }>;
    };
    catalysts: Array<{ event_name: string; release_at: string; importance: string }>;
  };
  history: Array<{ date: string; composite: number; gaugeIntensity: number }>;
}

export async function getRegimes(): Promise<RegimeRow[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    select r.index_id, i.symbol, i.name, r.as_of_date::text,
           r.trend_score::float8, r.breadth_score::float8, r.intermarket_score::float8,
           r.positioning_score::float8, r.narrative_score::float8,
           r.composite_score::float8, r.regime, r.confidence::float8, r.breakdown
      from regime_scores r
      join instruments i on i.id = r.index_id
     where (r.index_id, r.as_of_date) in (
       select index_id, max(as_of_date) from regime_scores group by index_id)
     order by i.symbol`);
  const { rows: hist } = await pool.query(`
    select index_id, as_of_date::text as date, composite_score::float8 as composite,
           coalesce((breakdown->'gauge'->>'intensity')::int, 0) as gauge
      from regime_scores order by as_of_date`);
  const histByIndex = new Map<number, RegimeRow["history"]>();
  for (const h of hist) {
    (histByIndex.get(h.index_id) ?? histByIndex.set(h.index_id, []).get(h.index_id)!)
      .push({ date: h.date, composite: h.composite, gaugeIntensity: h.gauge });
  }
  return rows.map((r: Omit<RegimeRow, "history">) => ({
    ...r,
    history: histByIndex.get(r.index_id) ?? [],
  }));
}

export async function getBreadthLatest() {
  const { rows } = await getPool().query(`
    select i.symbol, b.metric_date::text, b.advancers, b.decliners,
           b.pct_above_50d::float8, b.pct_above_200d::float8,
           b.new_highs_52w, b.new_lows_52w, b.mcclellan_osc::float8,
           b.mcclellan_sum::float8, b.breadth_divergence, b.as_of::text
      from breadth_metrics b join instruments i on i.id = b.index_id
     where (b.index_id, b.metric_date) in (
       select index_id, max(metric_date) from breadth_metrics group by index_id)
     order by i.symbol`);
  return rows;
}

export async function getIntermarket() {
  const { rows } = await getPool().query(`
    with latest as (
      select instrument_id, max(week_end) as week_end from ohlcv_weekly group by instrument_id
    )
    select i.symbol, i.name, i.metadata->>'role' as role,
           w.week_end::text, w.adj_close::float8 as close,
           w13.adj_close::float8 as close_13w_ago
      from instruments i
      join latest l on l.instrument_id = i.id
      join ohlcv_weekly w on w.instrument_id = i.id and w.week_end = l.week_end
      left join ohlcv_weekly w13 on w13.instrument_id = i.id
        and w13.week_end = (l.week_end - interval '91 days')::date
     where i.metadata->>'intermarket' = 'true' or i.symbol = '^VIX'
     order by i.symbol`);
  return rows;
}

export async function getMacroSnapshot() {
  const { rows } = await getPool().query(`
    select s.series_code, s.name, s.lead_lag, s.country,
           o.obs_date::text, o.value::float8, o.as_of::text
      from macro_series s
      join lateral (
        select obs_date, value, as_of from macro_observations
         where series_id = s.id and value is not null
         order by obs_date desc, as_of desc limit 1
      ) o on true
     order by s.country, s.name`);
  return rows;
}

export interface SignalRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  index_symbol: string | null;
  as_of_date: string;
  direction: string;
  conviction: number;
  composite_score: number;
  factors: Record<string, number | null>;
  gated: boolean;
  gate_reason: string | null;
  event_blackout: boolean;
  upcoming_events: Array<{ event_name: string; release_at: string }>;
}

export async function getSignals(): Promise<SignalRow[]> {
  const { rows } = await getPool().query(`
    select i.symbol, i.name, i.metadata->>'sector' as sector,
           ix.symbol as index_symbol, s.as_of_date::text, s.direction,
           s.conviction::float8, s.composite_score::float8,
           s.sub_scores->'factors' as factors, s.gated, s.gate_reason,
           s.event_blackout, s.upcoming_events
      from signals s
      join instruments i on i.id = s.instrument_id
      left join instruments ix on ix.id = s.index_id
     where s.as_of_date = (select max(as_of_date) from signals)
     order by s.gated asc, s.conviction desc`);
  return rows;
}

export async function getEvents(daysAhead = 30) {
  const { rows } = await getPool().query(
    `select country, event_name, release_at::text, importance,
            consensus::float8, previous::float8, unit, source, as_of::text
       from economic_events
      where release_at between now() - interval '1 day' and now() + ($1 || ' days')::interval
      order by release_at`,
    [daysAhead],
  );
  return rows;
}

export async function getStockDetail(symbol: string, timeframe: Timeframe = "weekly") {
  const pool = getPool();
  const { rows: inst } = await pool.query(
    `select id, symbol, name, currency, metadata from instruments where symbol = $1`,
    [symbol],
  );
  if (inst.length === 0) return null;
  const id = inst[0].id;
  const barsQuery =
    timeframe === "daily"
      ? pool.query(
          `select trade_date::text as time, adj_open::float8 as open, adj_high::float8 as high,
                  adj_low::float8 as low, adj_close::float8 as close, volume::float8
             from ohlcv_daily where instrument_id = $1 and adj_close is not null
            order by trade_date`,
          [id],
        )
      : pool.query(
          `select week_end::text as time, adj_open::float8 as open, adj_high::float8 as high,
                  adj_low::float8 as low, adj_close::float8 as close, volume::float8
             from ohlcv_weekly where instrument_id = $1 and adj_close is not null
            order by week_end`,
          [id],
        );
  const [bars, snapshots, signal, events] = await Promise.all([
    barsQuery,
    pool.query(
      `select week_end::text, rsi_14::float8, macd::float8, macd_signal::float8,
              macd_hist::float8, bb_upper::float8, bb_mid::float8, bb_lower::float8,
              ma_30w::float8, ma_40w::float8,
              adx_14::float8, mansfield_rs::float8, atr_14::float8,
              support::float8, resistance::float8
         from technical_snapshots where instrument_id = $1 order by week_end`,
      [id],
    ),
    pool.query(
      `select s.*, ix.symbol as index_symbol from signals s
        left join instruments ix on ix.id = s.index_id
       where s.instrument_id = $1 order by s.as_of_date desc limit 1`,
      [id],
    ),
    pool.query(
      `select event_name, release_at::text, importance from economic_events
        where event_name = 'Earnings: ' || $1 and release_at > now() - interval '1 day'
        order by release_at limit 3`,
      [symbol],
    ),
  ]);
  const chartBars: ChartBar[] =
    timeframe === "monthly" ? aggregateMonthly(bars.rows) : bars.rows;
  return {
    instrument: inst[0],
    timeframe,
    bars: chartBars,
    overlays: computeOverlays(chartBars, timeframe),
    snapshots: snapshots.rows,
    signal: signal.rows[0] ?? null,
    events: events.rows,
  };
}

export async function getBacktestReport() {
  const pool = getPool();
  const { rows: runs } = await pool.query(`
    select id, started_at::text, finished_at::text, weights_version,
           period_start::text, period_end::text, config
      from backtest_runs where status = 'success'
      order by started_at desc limit 1`);
  if (runs.length === 0) return null;
  const { rows: results } = await pool.query(
    `select segment_type, segment_key, n_signals, hit_rate::float8,
            avg_fwd_return_2w::float8, avg_fwd_return_4w::float8,
            avg_fwd_return_6w::float8, expectancy::float8,
            profit_factor::float8, max_drawdown::float8
       from backtest_results where run_id = $1 order by id`,
    [runs[0].id],
  );
  return { run: runs[0], results };
}

export async function getNarrative() {
  const pool = getPool();
  const [tone, themes, headlines, froth] = await Promise.all([
    pool.query(`
      select scope_key, reading_at::text as date, score::float8, volume
        from sentiment_readings
       where source = 'aggregate' and scope_type = 'market' and scope_key in ('US','UK')
       order by reading_at`),
    pool.query(`
      select scope_key, avg(score)::float8 as tone, sum(volume) as items,
             max(reading_at)::text as last
        from sentiment_readings
       where source = 'aggregate' and scope_type = 'theme'
         and reading_at > now() - interval '7 days'
       group by scope_key order by scope_key`),
    pool.query(`
      select detail->>'headline' as headline, detail->>'feed' as feed,
             detail->'themes' as themes, score::float8, reading_at::text,
             scope_key as market
        from sentiment_readings
       where source in ('rss','reddit') and score is not null
       order by reading_at desc limit 40`),
    pool.query(`
      select scope_key, score::float8 as bull_bear, volume, as_of::text
        from sentiment_readings
       where source = 'stocktwits'
         and as_of = (select max(as_of) from sentiment_readings where source = 'stocktwits')
       order by scope_key`),
  ]);
  return { tone: tone.rows, themes: themes.rows, headlines: headlines.rows, froth: froth.rows };
}

export interface IndexTechnicals {
  symbol: string;
  week_end: string;
  rsi_14: number | null;
  rsi_divergence: string | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  bb_pct_b: number | null;
  bb_bandwidth: number | null;
  bb_squeeze: boolean | null;
  bb_band_walk: string | null;
  volume_vs_20w: number | null;
  volume_confirms: boolean | null;
  price_vs_ma_30w: number | null;
  price_vs_ma_40w: number | null;
  ma_30w_slope: number | null;
  ma_40w_slope: number | null;
  ma_cross: string | null;
  adx_14: number | null;
  di_plus: number | null;
  di_minus: number | null;
  pos_52w_range: number | null;
  close: number | null;
}

export async function getIndexTechnicals(): Promise<Map<string, IndexTechnicals>> {
  const { rows } = await getPool().query(`
    select i.symbol, t.week_end::text,
           t.rsi_14::float8, t.rsi_divergence,
           t.macd::float8, t.macd_signal::float8, t.macd_hist::float8,
           t.bb_pct_b::float8, t.bb_bandwidth::float8, t.bb_squeeze, t.bb_band_walk,
           t.volume_vs_20w::float8, t.volume_confirms,
           t.price_vs_ma_30w::float8, t.price_vs_ma_40w::float8,
           t.ma_30w_slope::float8, t.ma_40w_slope::float8, t.ma_cross,
           t.adx_14::float8, t.di_plus::float8, t.di_minus::float8,
           t.pos_52w_range::float8,
           w.adj_close::float8 as close
      from technical_snapshots t
      join instruments i on i.id = t.instrument_id
      left join ohlcv_weekly w on w.instrument_id = t.instrument_id and w.week_end = t.week_end
     where i.instrument_type = 'index'
       and (t.instrument_id, t.week_end) in (
         select instrument_id, max(week_end) from technical_snapshots
          where instrument_id in (select id from instruments where instrument_type = 'index')
          group by instrument_id)
     order by i.symbol`);
  const map = new Map<string, IndexTechnicals>();
  for (const r of rows) map.set(r.symbol, r);
  return map;
}

export interface ConstituentBreadth {
  index_symbol: string;
  total: number;
  pct_overbought: number;
  pct_oversold: number;
}

export async function getConstituentBreadth(): Promise<Map<string, ConstituentBreadth>> {
  const { rows } = await getPool().query(`
    with latest_rsi as (
      select distinct on (instrument_id) instrument_id, rsi_14
        from technical_snapshots order by instrument_id, week_end desc
    )
    select i.symbol as index_symbol,
           count(*)::int as total,
           (100.0 * count(*) filter (where lr.rsi_14 > 70) / nullif(count(*), 0))::float8 as pct_overbought,
           (100.0 * count(*) filter (where lr.rsi_14 < 30) / nullif(count(*), 0))::float8 as pct_oversold
      from index_membership m
      join instruments i on i.id = m.index_id
      join latest_rsi lr on lr.instrument_id = m.constituent_id
     where m.valid_to is null
     group by m.index_id, i.symbol
     order by i.symbol`);
  const map = new Map<string, ConstituentBreadth>();
  for (const r of rows) map.set(r.index_symbol, r);
  return map;
}

/** Freshness summary for the staleness banner. */
export async function getDataHealth() {
  const { rows } = await getPool().query(`
    select 'index bars' as item, max(trade_date)::text as latest,
           (current_date - max(trade_date))::int as days_behind
      from ohlcv_daily d join instruments i on i.id = d.instrument_id
     where i.instrument_type = 'index'
    union all
    select 'signals', max(as_of_date)::text, (current_date - max(as_of_date))::int from signals
    union all
    select 'regime', max(as_of_date)::text, (current_date - max(as_of_date))::int from regime_scores
    union all
    select 'headlines', max(reading_at)::date::text, (current_date - max(reading_at)::date)::int
      from sentiment_readings where source in ('rss','reddit')`);
  const { rows: lastRuns } = await getPool().query(`
    select job_name, status, started_at::text
      from ingestion_runs
     where (job_name, started_at) in (
       select job_name, max(started_at) from ingestion_runs group by job_name)
     order by started_at desc limit 12`);
  return { freshness: rows, lastRuns };
}
