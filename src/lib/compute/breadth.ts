import { getPool, upsertRows } from "../db";
import { sma, ema } from "../indicators/moving";

/**
 * Market breadth per index per trading day (Layer 1B — the heart of the
 * leading signal). Computed from constituent daily bars over the retention
 * window, on the index's own trading calendar, honouring point-in-time
 * membership (which accrues from first ingestion; earlier history uses
 * current membership — survivorship caveat, flagged at gate).
 *
 * bullish_pct_index caveat: true BPI needs point-and-figure buy signals;
 * v1 stores the % of members with SMA20 > SMA50 as a documented proxy
 * (extras.bpi_method).
 */

interface DailyRow {
  instrument_id: number;
  trade_date: string;
  close: number | null;
  volume: number | null;
}

interface MemberWindow {
  id: number;
  from: string;
  to: string | null;
  /** Earliest window per constituent extends backward: membership tracking
   *  starts at first ingestion, and pre-tracking history uses current
   *  membership (survivorship caveat, flagged at gate). */
  extendBack: boolean;
}

export async function computeIndexBreadth(indexId: number, indexSymbol: string): Promise<number> {
  const pool = getPool();

  const { rows: members }: { rows: Array<{ constituent_id: number; valid_from: string; valid_to: string | null }> } =
    await pool.query(
      `select constituent_id, valid_from::text, valid_to::text
         from index_membership where index_id = $1`,
      [indexId],
    );
  if (members.length === 0) return 0;
  const windows = new Map<number, MemberWindow[]>();
  for (const m of members) {
    const w: MemberWindow = {
      id: m.constituent_id, from: m.valid_from, to: m.valid_to, extendBack: false,
    };
    (windows.get(m.constituent_id) ?? windows.set(m.constituent_id, []).get(m.constituent_id)!).push(w);
  }
  for (const list of windows.values()) {
    list.sort((a, b) => a.from.localeCompare(b.from));
    list[0].extendBack = true;
  }

  // Index trading calendar + closes.
  const { rows: indexBars }: { rows: Array<{ trade_date: string; close: number }> } = await pool.query(
    `select trade_date::text, adj_close::float8 as close
       from ohlcv_daily where instrument_id = $1 and adj_close is not null
      order by trade_date`,
    [indexId],
  );
  const calendar = indexBars.map((b) => b.trade_date);
  const indexClose = new Map(indexBars.map((b) => [b.trade_date, b.close]));
  const dayIdx = new Map(calendar.map((d, i) => [d, i]));

  // All constituent daily bars in one pull.
  const { rows: bars }: { rows: DailyRow[] } = await pool.query(
    `select instrument_id, trade_date::text, adj_close::float8 as close, volume::float8 as volume
       from ohlcv_daily where instrument_id = any($1::bigint[])
      order by instrument_id, trade_date`,
    [[...windows.keys()]],
  );

  // Per-constituent series aligned to the index calendar.
  interface Series {
    close: (number | null)[];
    volume: (number | null)[];
    sma20: (number | null)[];
    sma50: (number | null)[];
    sma200: (number | null)[];
    hi252: (number | null)[];
    lo252: (number | null)[];
  }
  const byInstrument = new Map<number, DailyRow[]>();
  for (const b of bars) {
    (byInstrument.get(b.instrument_id) ?? byInstrument.set(b.instrument_id, []).get(b.instrument_id)!).push(b);
  }
  const series = new Map<number, Series>();
  for (const [id, rows] of byInstrument) {
    const close: (number | null)[] = new Array(calendar.length).fill(null);
    const volume: (number | null)[] = new Array(calendar.length).fill(null);
    for (const r of rows) {
      const i = dayIdx.get(r.trade_date);
      if (i !== undefined) {
        close[i] = r.close;
        volume[i] = r.volume;
      }
    }
    const hi252: (number | null)[] = new Array(calendar.length).fill(null);
    const lo252: (number | null)[] = new Array(calendar.length).fill(null);
    let window: number[] = [];
    for (let i = 0; i < calendar.length; i++) {
      if (close[i] != null) {
        window.push(close[i]!);
        if (window.length > 252) window = window.slice(-252);
        if (window.length >= 100) {
          hi252[i] = Math.max(...window);
          lo252[i] = Math.min(...window);
        }
      }
    }
    series.set(id, {
      close, volume,
      sma20: sma(close, 20), sma50: sma(close, 50), sma200: sma(close, 200),
      hi252, lo252,
    });
  }

  const isMember = (id: number, date: string): boolean =>
    (windows.get(id) ?? []).some(
      (w) => (w.extendBack || w.from <= date) && (w.to == null || w.to > date),
    );

  // Daily aggregates.
  const rows: unknown[][] = [];
  let adLine = 0;
  const rana: (number | null)[] = [];
  const recordHighPct: (number | null)[] = [];
  const pctAbove50Series: (number | null)[] = [];
  const pctAbove200Series: (number | null)[] = [];
  let mcclellanSum = 0;

  // First pass: per-day tallies (needed before EMA-based McClellan).
  interface DayTally {
    date: string; adv: number; dec: number; unch: number;
    above20v50: number; above50: number; above200: number; withMa50: number;
    withMa200: number; withMa20v50: number;
    newHighs: number; newLows: number; upVol: number; downVol: number; n: number;
  }
  const tallies: DayTally[] = [];
  for (let i = 0; i < calendar.length; i++) {
    const date = calendar[i];
    const t: DayTally = {
      date, adv: 0, dec: 0, unch: 0,
      above20v50: 0, above50: 0, above200: 0, withMa50: 0, withMa200: 0, withMa20v50: 0,
      newHighs: 0, newLows: 0, upVol: 0, downVol: 0, n: 0,
    };
    for (const [id, s] of series) {
      if (!isMember(id, date)) continue;
      const c = s.close[i];
      if (c == null) continue;
      let prev: number | null = null;
      for (let j = i - 1; j >= Math.max(0, i - 7); j--) {
        if (s.close[j] != null) { prev = s.close[j]; break; }
      }
      if (prev == null) continue;
      t.n++;
      if (c > prev) { t.adv++; t.upVol += s.volume[i] ?? 0; }
      else if (c < prev) { t.dec++; t.downVol += s.volume[i] ?? 0; }
      else t.unch++;
      if (s.sma50[i] != null) { t.withMa50++; if (c > s.sma50[i]!) t.above50++; }
      if (s.sma200[i] != null) { t.withMa200++; if (c > s.sma200[i]!) t.above200++; }
      if (s.sma20[i] != null && s.sma50[i] != null) { t.withMa20v50++; if (s.sma20[i]! > s.sma50[i]!) t.above20v50++; }
      if (s.hi252[i] != null && c >= s.hi252[i]!) t.newHighs++;
      if (s.lo252[i] != null && c <= s.lo252[i]!) t.newLows++;
    }
    tallies.push(t);
    rana.push(t.adv + t.dec > 0 ? (1000 * (t.adv - t.dec)) / (t.adv + t.dec) : null);
    recordHighPct.push(
      t.newHighs + t.newLows > 0 ? (100 * t.newHighs) / (t.newHighs + t.newLows) : null,
    );
    pctAbove50Series.push(t.withMa50 > 0 ? (100 * t.above50) / t.withMa50 : null);
    pctAbove200Series.push(t.withMa200 > 0 ? (100 * t.above200) / t.withMa200 : null);
  }

  const ema19 = ema(rana, 19);
  const ema39 = ema(rana, 39);
  const hlSmooth = sma(recordHighPct, 10);

  for (let i = 0; i < tallies.length; i++) {
    const t = tallies[i];
    if (t.n < 10) continue; // not enough member data that day
    adLine += t.adv - t.dec;
    const osc = ema19[i] != null && ema39[i] != null ? ema19[i]! - ema39[i]! : null;
    if (osc != null) mcclellanSum += osc;

    // Divergence: index at a 60-day high while internals deteriorate.
    let divergence = false;
    const ic = indexClose.get(t.date);
    if (ic != null && i >= 60) {
      let hi60 = -Infinity;
      for (let j = i - 60; j <= i; j++) {
        const v = indexClose.get(calendar[j]);
        if (v != null) hi60 = Math.max(hi60, v);
      }
      const p50now = pctAbove50Series[i];
      const p50past = pctAbove50Series[i - 20];
      divergence =
        ic >= hi60 * 0.999 &&
        p50now != null && p50past != null &&
        p50now < p50past - 5;
    }

    rows.push([
      indexId, t.date, t.adv, t.dec, t.unch,
      adLine, t.dec > 0 ? t.adv / t.dec : null,
      pctAbove50Series[i], pctAbove200Series[i],
      t.newHighs, t.newLows, hlSmooth[i],
      osc, osc != null ? mcclellanSum : null,
      t.upVol, t.downVol,
      t.withMa20v50 > 0 ? (100 * t.above20v50) / t.withMa20v50 : null,
      divergence,
      JSON.stringify({ members_with_data: t.n, bpi_method: "sma20>sma50 proxy" }),
      new Date().toISOString(),
    ]);
  }

  return upsertRows(
    "breadth_metrics",
    [
      "index_id", "metric_date", "advancers", "decliners", "unchanged",
      "adv_dec_line", "adv_dec_ratio", "pct_above_50d", "pct_above_200d",
      "new_highs_52w", "new_lows_52w", "high_low_index",
      "mcclellan_osc", "mcclellan_sum", "up_volume", "down_volume",
      "bullish_pct_index", "breadth_divergence", "extras", "as_of",
    ],
    ["index_id", "metric_date"],
    rows,
  ).then((n) => {
    console.log(`  ${indexSymbol}: ${n} breadth days`);
    return n;
  });
}
