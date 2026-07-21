import { getPool, upsertRows } from "../db";
import { INDICATOR_PARAMS } from "../../config/indicators";
import { sma, slope, crosses } from "../indicators/moving";
import { rsi } from "../indicators/rsi";
import { macd } from "../indicators/macd";
import { bollinger } from "../indicators/bollinger";
import { adxAtr } from "../indicators/adx";
import { obv, adLine, volumeVsAverage } from "../indicators/volume";
import { mansfieldRs } from "../indicators/mansfield";
import { rangePosition } from "../indicators/range";
import { rsiDivergence } from "../indicators/divergence";

/**
 * Layer-2 weekly technical snapshots.
 *
 * Price inputs are the ADJUSTED series (split + dividend, continuous across
 * corporate actions); volume is the vendor split-adjusted raw volume.
 * Indicators are computed over the instrument's FULL weekly history (so
 * long-window values like the 52-week Mansfield zero line are correct), but
 * snapshots are stored only for the most recent `snapshotRetentionWeeks`
 * (backtests recompute in-memory from ohlcv_weekly — storage guardrail).
 *
 * Mansfield RS compares a constituent to its own index; dual-listed members
 * use priority SPX > NDX > UKX.
 */

interface WeeklyBarRow {
  week_end: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

async function loadWeeklyBars(instrumentId: number): Promise<WeeklyBarRow[]> {
  const { rows } = await getPool().query(
    `select week_end::text as week_end,
            adj_open::float8 as open, adj_high::float8 as high,
            adj_low::float8 as low, adj_close::float8 as close,
            volume::float8 as volume
       from ohlcv_weekly where instrument_id = $1 order by week_end`,
    [instrumentId],
  );
  return rows;
}

export interface ComputeResult {
  symbol: string;
  snapshots: number;
}

export async function computeInstrumentTechnicals(
  instrument: { id: number; symbol: string },
  indexCloseByWeek: Map<string, number> | null,
): Promise<ComputeResult> {
  const P = INDICATOR_PARAMS;
  const bars = await loadWeeklyBars(instrument.id);
  if (bars.length < P.movingAverages.slow) {
    return { symbol: instrument.symbol, snapshots: 0 };
  }

  const closes = bars.map((b) => b.close);
  const rsiSeries = rsi(closes, P.rsi.period);
  const divergences = rsiDivergence(
    closes, rsiSeries, P.divergence.pivotWidth, P.divergence.lookbackWeeks,
  );
  const macdSeries = macd(closes, P.macd.fast, P.macd.slow, P.macd.signal);
  const bb = bollinger(
    closes, P.bollinger.period, P.bollinger.stdDev,
    P.bollinger.squeezeLookback, P.bollinger.bandWalkWeeks,
  );
  const obvSeries = obv(bars);
  const adSeries = adLine(bars);
  const volReads = volumeVsAverage(bars, P.volume.averageWeeks);
  const ma30 = sma(closes, P.movingAverages.fast);
  const ma40 = sma(closes, P.movingAverages.slow);
  const ma30Slope = slope(ma30, P.movingAverages.slopeWeeks);
  const ma40Slope = slope(ma40, P.movingAverages.slopeWeeks);
  const crossEvents = crosses(ma30, ma40);
  const adxSeries = adxAtr(bars, P.adx.period);
  const ranges = rangePosition(bars, P.range.weeks52, P.range.srWeeks);
  const mansfield = indexCloseByWeek
    ? mansfieldRs(
        closes,
        bars.map((b) => indexCloseByWeek.get(b.week_end) ?? null),
        P.mansfield.period,
        P.mansfield.trendWeeks,
      )
    : null;

  const startIdx = Math.max(0, bars.length - P.snapshotRetentionWeeks);
  const rows: unknown[][] = [];
  for (let i = startIdx; i < bars.length; i++) {
    const b = bars[i];
    if (b.close == null) continue;
    const m = mansfield?.[i];
    rows.push([
      instrument.id, b.week_end,
      rsiSeries[i], divergences[i],
      macdSeries[i].macd, macdSeries[i].signal, macdSeries[i].histogram,
      bb[i].upper, bb[i].mid, bb[i].lower, bb[i].pctB, bb[i].bandwidth,
      bb[i].squeeze, bb[i].bandWalk,
      obvSeries[i], adSeries[i], volReads[i].ratio, volReads[i].confirms,
      ma30[i], ma40[i], ma30Slope[i], ma40Slope[i],
      ma30[i] != null && ma30[i] !== 0 ? b.close / ma30[i]! - 1 : null,
      ma40[i] != null && ma40[i] !== 0 ? b.close / ma40[i]! - 1 : null,
      crossEvents[i],
      adxSeries[i].adx, adxSeries[i].diPlus, adxSeries[i].diMinus,
      m?.rs ?? null, m?.trend ?? null,
      ranges[i].pos52w, adxSeries[i].atr,
      ranges[i].support, ranges[i].resistance,
    ]);
  }

  const written = await upsertRows(
    "technical_snapshots",
    [
      "instrument_id", "week_end",
      "rsi_14", "rsi_divergence",
      "macd", "macd_signal", "macd_hist",
      "bb_upper", "bb_mid", "bb_lower", "bb_pct_b", "bb_bandwidth",
      "bb_squeeze", "bb_band_walk",
      "obv", "ad_line", "volume_vs_20w", "volume_confirms",
      "ma_30w", "ma_40w", "ma_30w_slope", "ma_40w_slope",
      "price_vs_ma_30w", "price_vs_ma_40w",
      "ma_cross",
      "adx_14", "di_plus", "di_minus",
      "mansfield_rs", "rs_trend",
      "pos_52w_range", "atr_14",
      "support", "resistance",
    ],
    ["instrument_id", "week_end"],
    rows,
  );
  return { symbol: instrument.symbol, snapshots: written };
}

export interface TechnicalsTarget {
  id: number;
  symbol: string;
  instrument_type: string;
  /** Index key whose closes to use for Mansfield RS (null for indices etc.). */
  rsIndexKey: string | null;
}

/** Equities + indices + sector ETFs, with each equity's RS index resolved. */
export async function listTechnicalsTargets(): Promise<TechnicalsTarget[]> {
  const { rows } = await getPool().query(`
    select i.id, i.symbol, i.instrument_type,
           (select idx.symbol
              from index_membership m join instruments idx on idx.id = m.index_id
             where m.constituent_id = i.id and m.valid_to is null
             order by case idx.symbol when 'SPX' then 1 when 'NDX' then 2 else 3 end
             limit 1) as rs_index_key
      from instruments i
     where i.is_active and i.instrument_type in ('equity','index','etf')
     order by i.instrument_type, i.symbol`);
  return rows.map((r: { id: number; symbol: string; instrument_type: string; rs_index_key: string | null }) => ({
    id: r.id,
    symbol: r.symbol,
    instrument_type: r.instrument_type,
    // Off-index (watch-only) equities still get a Mansfield RS benchmark:
    // LSE names vs UKX, plain US tickers vs SPX; other exchanges omit RS.
    rsIndexKey:
      r.rs_index_key ??
      (r.instrument_type !== "equity"
        ? null
        : r.symbol.endsWith(".L")
          ? "UKX"
          : r.symbol.includes(".") || r.symbol.includes("=")
            ? null
            : "SPX"),
  }));
}

/** Weekly adjusted closes for an index, keyed by week_end. */
export async function loadIndexCloses(indexSymbol: string): Promise<Map<string, number>> {
  const { rows } = await getPool().query(
    `select w.week_end::text as week_end, w.adj_close::float8 as close
       from ohlcv_weekly w join instruments i on i.id = w.instrument_id
      where i.symbol = $1 and w.adj_close is not null`,
    [indexSymbol],
  );
  return new Map(rows.map((r: { week_end: string; close: number }) => [r.week_end, r.close]));
}
