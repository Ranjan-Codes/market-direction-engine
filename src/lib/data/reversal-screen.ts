import { getPool } from "../db";
import {
  DEFAULT_REVERSAL_BUY_THRESHOLDS,
  evaluateReversalBuy,
  type ReversalBuyResult,
  type ReversalBuyThresholds,
} from "../compute/reversal-buy";

export interface ReversalScreenRow {
  symbol: string;
  name: string | null;
  index_symbol: string;
  week_end: string;
  rsi14: number | null;
  rsi14Prev: number | null;
  bbPctB: number | null;
  volumeVs20w: number | null;
  volumeConfirms: boolean | null;
  weeklyOpen: number | null;
  weeklyClose: number | null;
  result: ReversalBuyResult;
}

interface RawRow {
  symbol: string;
  name: string | null;
  index_symbol: string;
  week_end: string;
  rsi_14: number | null;
  rsi_14_prev: number | null;
  bb_pct_b: number | null;
  volume_vs_20w: number | null;
  volume_confirms: boolean | null;
  weekly_open: number | null;
  weekly_close: number | null;
}

/*
 * Index-constituent reversal Buy screen.
 *
 * For every equity that is an active constituent of at least one index, this
 * pulls the two most recent weekly technical snapshots (current + previous RSI)
 * and the latest weekly OHLC bar, then evaluates the short-term reversal Buy
 * rule. Only index constituents are included.
 *
 * Fail-soft: any error returns an empty list so the page renders "no data yet"
 * rather than crashing.
 */
export async function getReversalScreen(
  thresholds: ReversalBuyThresholds = DEFAULT_REVERSAL_BUY_THRESHOLDS,
): Promise<ReversalScreenRow[]> {
  try {
    const { rows } = await getPool().query(
      `
      with ranked_ts as (
        select
          t.instrument_id,
          t.week_end,
          t.rsi_14,
          t.bb_pct_b,
          t.volume_vs_20w,
          t.volume_confirms,
          row_number() over (
            partition by t.instrument_id order by t.week_end desc
          ) as rn
        from technical_snapshots t
      ),
      latest_ts as (
        select instrument_id, week_end, rsi_14, bb_pct_b,
               volume_vs_20w, volume_confirms
        from ranked_ts where rn = 1
      ),
      prev_ts as (
        select instrument_id, rsi_14 as rsi_14_prev
        from ranked_ts where rn = 2
      ),
      ranked_bar as (
        select
          o.instrument_id,
          o.adj_open as weekly_open,
          o.adj_close as weekly_close,
          row_number() over (
            partition by o.instrument_id order by o.week_end desc
          ) as rn
        from ohlcv_weekly o
      ),
      latest_bar as (
        select instrument_id, weekly_open, weekly_close
        from ranked_bar where rn = 1
      )
      select
        i.symbol,
        i.name,
        idx.symbol as index_symbol,
        lt.week_end,
        lt.rsi_14,
        pt.rsi_14_prev,
        lt.bb_pct_b,
        lt.volume_vs_20w,
        lt.volume_confirms,
        lb.weekly_open,
        lb.weekly_close
      from latest_ts lt
      join instruments i
        on i.id = lt.instrument_id
        and i.instrument_type = 'equity'
        and i.is_active = true
      join lateral (
        select ix.symbol
        from index_membership m
        join instruments ix on ix.id = m.index_id
        where m.constituent_id = i.id and m.valid_to is null
        order by
          case ix.symbol when 'SPX' then 1 when 'NDX' then 2 else 3 end
        limit 1
      ) idx on true
      left join prev_ts pt on pt.instrument_id = lt.instrument_id
      left join latest_bar lb on lb.instrument_id = lt.instrument_id
      order by i.symbol asc
      `,
    );

    return (rows as RawRow[]).map((r) => {
      const input = {
        rsi14: r.rsi_14,
        rsi14Prev: r.rsi_14_prev,
        bbPctB: r.bb_pct_b,
        volumeVs20w: r.volume_vs_20w,
        volumeConfirms: r.volume_confirms,
        weeklyOpen: r.weekly_open,
        weeklyClose: r.weekly_close,
      };
      return {
        symbol: r.symbol,
        name: r.name,
        index_symbol: r.index_symbol,
        week_end: r.week_end,
        rsi14: r.rsi_14,
        rsi14Prev: r.rsi_14_prev,
        bbPctB: r.bb_pct_b,
        volumeVs20w: r.volume_vs_20w,
        volumeConfirms: r.volume_confirms,
        weeklyOpen: r.weekly_open,
        weeklyClose: r.weekly_close,
        result: evaluateReversalBuy(input, thresholds),
      };
    });
  } catch (err) {
    console.error("getReversalScreen failed", err);
    return [];
  }
}
import { getPool } from "../db";
import {
  DEFAULT_REVERSAL_BUY_THRESHOLDS,
  evaluateReversalBuy,
  type ReversalBuyResult,
  type ReversalBuyThresholds,
} from "../compute/reversal-buy";

export interface ReversalScreenRow {
  symbol: string;
  name: string | null;
  index_symbol: string;
  week_end: string;
  rsi14: number | null;
  rsi14Prev: number | null;
  bbPctB: number | null;
  volumeVs20w: number | null;
  volumeConfirms: boolean | null;
  weeklyOpen: number | null;
  weeklyClose: number | null;
  result: ReversalBuyResult;
}

interface RawRow {
  symbol: string;
  name: string | null;
  index_symbol: string;
  week_end: string;
  rsi_14: number | null;
  rsi_14_prev: number | null;
  bb_pct_b: number | null;
  volume_vs_20w: number | null;
  volume_confirms: boolean | null;
  weekly_open: number | null;
  weekly_close: number | null;
}

/*
 * Index-constituent reversal Buy screen.
 *
 * For every equity that is an active constituent of at least one index, this
 * pulls the two most recent weekly technical snapshots (current + previous RSI)
 * and the latest weekly OHLC bar, then evaluates the short-term reversal Buy
 * rule. Only index constituents are included.
 *
 * Fail-soft: any error returns an empty list so the page renders "no data yet"
 * rather than crashing.
 */
export async function getReversalScreen(
  thresholds: ReversalBuyThresholds = DEFAULT_REVERSAL_BUY_THRESHOLDS,
): Promise<ReversalScreenRow[]> {
  try {
    const { rows } = await getPool().query(
      `
      with ranked_ts as (
        select
          t.instrument_id,
          t.week_end,
          t.rsi_14,
          t.bb_pct_b,
          t.volume_vs_20w,
          t.volume_confirms,
          row_number() over (
            partition by t.instrument_id order by t.week_end desc
          ) as rn
        from technical_snapshots t
      ),
      latest_ts as (
        select instrument_id, week_end, rsi_14, bb_pct_b,
               volume_vs_20w, volume_confirms
        from ranked_ts where rn = 1
      ),
      prev_ts as (
        select instrument_id, rsi_14 as rsi_14_prev
        from ranked_ts where rn = 2
      ),
      ranked_bar as (
        select
          o.instrument_id,
          o.open as weekly_open,
          o.close as weekly_close,
          row_number() over (
            partition by o.instrument_id order by o.week_end desc
          ) as rn
        from ohlcv_weekly o
      ),
      latest_bar as (
        select instrument_id, weekly_open, weekly_close
        from ranked_bar where rn = 1
      )
      select
        i.symbol,
        i.name,
        idx.symbol as index_symbol,
        lt.week_end,
        lt.rsi_14,
        pt.rsi_14_prev,
        lt.bb_pct_b,
        lt.volume_vs_20w,
        lt.volume_confirms,
        lb.weekly_open,
        lb.weekly_close
      from latest_ts lt
      join instruments i
        on i.id = lt.instrument_id
        and i.instrument_type = 'equity'
        and i.is_active = true
      join lateral (
        select ix.symbol
        from index_membership m
        join instruments ix on ix.id = m.index_id
        where m.constituent_id = i.id and m.valid_to is null
        order by
          case ix.symbol when 'SPX' then 1 when 'NDX' then 2 else 3 end
        limit 1
      ) idx on true
      left join prev_ts pt on pt.instrument_id = lt.instrument_id
      left join latest_bar lb on lb.instrument_id = lt.instrument_id
      order by i.symbol asc
      `,
    );

    return (rows as RawRow[]).map((r) => {
      const input = {
        rsi14: r.rsi_14,
        rsi14Prev: r.rsi_14_prev,
        bbPctB: r.bb_pct_b,
        volumeVs20w: r.volume_vs_20w,
        volumeConfirms: r.volume_confirms,
        weeklyOpen: r.weekly_open,
        weeklyClose: r.weekly_close,
      };
      return {
        symbol: r.symbol,
        name: r.name,
        index_symbol: r.index_symbol,
        week_end: r.week_end,
        rsi14: r.rsi_14,
        rsi14Prev: r.rsi_14_prev,
        bbPctB: r.bb_pct_b,
        volumeVs20w: r.volume_vs_20w,
        volumeConfirms: r.volume_confirms,
        weeklyOpen: r.weekly_open,
        weeklyClose: r.weekly_close,
        result: evaluateReversalBuy(input, thresholds),
      };
    });
  } catch (err) {
    console.error("getReversalScreen failed", err);
    return [];
  }
}
