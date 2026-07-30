import { getPool } from "../db";
import { suggest, type Suggestion } from "../compute/suggestion";

export interface WatchlistEntry {
  symbol: string;
  name: string | null;
  sector: string | null;
  index_symbol: string | null;
  added_at: string;
  direction: string | null;
  conviction: number | null;
  gated: boolean;
  event_blackout: boolean;
  factors: Record<string, number | null> | null;
  rsi_14: number | null;
  mansfield_rs: number | null;
  pos_52w_range: number | null;
  week_end: string | null;
  close: number | null;
  change_pct: number | null;
  market_cap: number | null;
  spark_prices: number[] | null;
  prev_direction: string | null;
  suggestion: Suggestion;
}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const pool = getPool();
  const { rows } = await pool.query(`
    with latest_snap as (
      select distinct on (instrument_id) *
        from technical_snapshots order by instrument_id, week_end desc
    ),
    latest_signal as (
      select distinct on (instrument_id) *
        from signals order by instrument_id, as_of_date desc
    ),
    latest_regime as (
      select distinct on (index_id) index_id, breakdown
        from regime_scores order by index_id, as_of_date desc
    ),
    daily_chg as (
      select instrument_id, adj_close::float8 as close,
             ((adj_close - lag(adj_close) over (partition by instrument_id order by trade_date))
              / nullif(lag(adj_close) over (partition by instrument_id order by trade_date), 0))::float8 as change_pct,
             row_number() over (partition by instrument_id order by trade_date desc) as rn
        from ohlcv_daily
       where adj_close is not null
         and instrument_id in (select instrument_id from watchlist_items)
    ),
    spark as (
      select d2.instrument_id,
             array_agg(d2.adj_close::float8 order by d2.trade_date) as prices
        from (
          select instrument_id, trade_date, adj_close,
                 row_number() over (partition by instrument_id order by trade_date desc) as rn
            from ohlcv_daily
           where adj_close is not null
             and instrument_id in (select instrument_id from watchlist_items)
        ) d2 where d2.rn <= 5
        group by d2.instrument_id
    ),
    prev_sig as (
      select distinct on (instrument_id)
             instrument_id, direction as prev_direction
        from signals
       where as_of_date <= current_date - interval '7 days'
         and instrument_id in (select instrument_id from watchlist_items)
       order by instrument_id, as_of_date desc
    )
    select i.symbol, i.name, i.metadata->>'sector' as sector,
           (i.metadata->>'marketCap')::float8 as market_cap,
           ix.symbol as index_symbol, w.added_at::text,
           s.direction, s.conviction::float8, coalesce(s.gated, false) as gated,
           coalesce(s.event_blackout, false) as event_blackout,
           s.gate_reason, s.sub_scores->'factors' as factors,
           t.rsi_14::float8, t.bb_pct_b::float8, t.pos_52w_range::float8,
           t.bb_squeeze, t.rsi_divergence, t.rs_trend, t.mansfield_rs::float8,
           t.week_end::text,
           r.breakdown->'gauge' as index_gauge,
           dc.close, dc.change_pct,
           sp.prices as spark_prices,
           ps.prev_direction,
           (select release_at::text from economic_events e
             where e.event_name = 'Earnings: ' || i.symbol
               and e.release_at between now() and now() + interval '30 days'
             order by e.release_at limit 1) as own_earnings
      from watchlist_items w
      join instruments i on i.id = w.instrument_id
      left join latest_signal s on s.instrument_id = i.id
      left join latest_snap t on t.instrument_id = i.id
      left join instruments ix on ix.id = s.index_id
      left join latest_regime r on r.index_id = s.index_id
      left join daily_chg dc on dc.instrument_id = i.id and dc.rn = 1
      left join spark sp on sp.instrument_id = i.id
      left join prev_sig ps on ps.instrument_id = i.id
     order by w.added_at desc`);

  return rows.map((r: Record<string, any>) => ({
    symbol: r.symbol,
    name: r.name,
    sector: r.sector,
    index_symbol: r.index_symbol,
    added_at: r.added_at,
    direction: r.direction,
    conviction: r.conviction,
    gated: r.gated,
    event_blackout: r.event_blackout,
    factors: r.factors,
    rsi_14: r.rsi_14,
    mansfield_rs: r.mansfield_rs,
    pos_52w_range: r.pos_52w_range,
    week_end: r.week_end,
    close: r.close ?? null,
    change_pct: r.change_pct ?? null,
    market_cap: r.market_cap ?? null,
    spark_prices: r.spark_prices ?? null,
    prev_direction: r.prev_direction ?? null,
    suggestion: suggest({
      direction: r.direction,
      conviction: r.conviction,
      gated: r.gated,
      gateReason: r.gate_reason,
      factors: r.factors,
      rsi14: r.rsi_14,
      pctB: r.bb_pct_b,
      pos52w: r.pos_52w_range,
      squeeze: r.bb_squeeze,
      rsiDivergence: r.rsi_divergence,
      rsTrend: r.rs_trend,
      indexGauge: r.index_gauge ?? null,
      ownEarnings: r.own_earnings,
    }),
  }));
}

export async function getWatchlistSymbols(): Promise<Set<string>> {
  const { rows } = await getPool().query(
    `select i.symbol from watchlist_items w join instruments i on i.id = w.instrument_id`,
  );
  return new Set(rows.map((r: { symbol: string }) => r.symbol));
}
