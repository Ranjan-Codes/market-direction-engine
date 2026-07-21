import { getPool } from "../db";
import { computeFactors, compose, type FactorInputs } from "../compute/signals";
import { SIGNAL_WEIGHTS, WEIGHTS_VERSION } from "../../config/weights";
import {
  hitRate, avgReturn, expectancy, profitFactor, maxDrawdown, periodAverages,
  type SignalOutcome,
} from "./metrics";

/**
 * Layer 4 — validation. Replays the Layer-3 factor model over the full
 * stored snapshot history (same code path as live signals) and the
 * reversal-risk gauge over the regime history, strictly point-in-time:
 * a signal at week W reads only snapshot data ≤ W (true by construction —
 * indicators are aligned) and is scored against forward returns at
 * +2/+4/+6 weeks from adjusted weekly closes.
 *
 * No parameters have been fitted to this history (v1 weights are priors),
 * so the whole window is effectively out-of-sample; the first/second-half
 * split reported here is a stability check, and becomes a true walk-forward
 * harness when weights start being tuned.
 *
 * Known caveats carried from ingestion (reported in run config):
 * - membership survivorship before 2026-07-21 (current members backfilled)
 * - regime history ≈ 116 weeks; older signal weeks report regime 'unknown'
 */

const HORIZONS = [2, 4, 6] as const;

interface SnapshotHistoryRow extends FactorInputs {
  instrument_id: number;
  week_end: string;
  index_id: number | null;
  index_symbol: string | null;
}

interface Entry {
  date: string;
  index: string;
  regime: string;
  direction: "bullish" | "bearish";
  gated: boolean;
  fwd: Partial<Record<(typeof HORIZONS)[number], number>>;
}

export interface SegmentMetrics {
  segmentType: string;
  segmentKey: string;
  n: number;
  hitRate: number | null;
  avg2w: number | null;
  avg4w: number | null;
  avg6w: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  detail: Record<string, unknown>;
}

function metricsFor(entries: Entry[], type: string, key: string): SegmentMetrics {
  const at = (h: (typeof HORIZONS)[number]): SignalOutcome[] =>
    entries
      .filter((e) => e.fwd[h] != null)
      .map((e) => ({ side: e.direction === "bullish" ? 1 : -1, fwdReturn: e.fwd[h]! }));
  const o4 = at(4);
  const dated = entries
    .filter((e) => e.fwd[4] != null)
    .map((e) => ({
      date: e.date,
      outcome: { side: e.direction === "bullish" ? 1 : (-1 as 1 | -1), fwdReturn: e.fwd[4]! },
    }));
  const perHorizon = Object.fromEntries(
    HORIZONS.map((h) => [
      `h${h}w`,
      { n: at(h).length, hitRate: hitRate(at(h)), avg: avgReturn(at(h)) },
    ]),
  );
  return {
    segmentType: type,
    segmentKey: key,
    n: o4.length,
    hitRate: hitRate(o4),
    avg2w: avgReturn(at(2)),
    avg4w: avgReturn(o4),
    avg6w: avgReturn(at(6)),
    expectancy: expectancy(o4),
    profitFactor: profitFactor(o4),
    maxDrawdown: maxDrawdown(periodAverages(dated)),
    detail: perHorizon,
  };
}

export async function runBacktest(): Promise<{ runId: number; segments: SegmentMetrics[] }> {
  const pool = getPool();

  // ── Load snapshot history joined with weekly closes and RS index ──────────
  const { rows: snaps }: { rows: SnapshotHistoryRow[] } = await pool.query(`
    select t.instrument_id, t.week_end::text,
           t.rsi_14::float8, t.rsi_divergence, t.macd_hist::float8,
           t.bb_pct_b::float8, t.bb_squeeze, t.bb_band_walk,
           t.volume_vs_20w::float8, t.volume_confirms,
           t.ma_30w_slope::float8, t.ma_40w_slope::float8,
           t.price_vs_ma_30w::float8, t.price_vs_ma_40w::float8, t.ma_cross,
           t.adx_14::float8, t.di_plus::float8, t.di_minus::float8,
           t.mansfield_rs::float8, t.rs_trend, t.pos_52w_range::float8,
           w.adj_close::float8 as close,
           idx.id as index_id, idx.symbol as index_symbol
      from technical_snapshots t
      join instruments i on i.id = t.instrument_id and i.instrument_type = 'equity'
      left join ohlcv_weekly w on w.instrument_id = t.instrument_id and w.week_end = t.week_end
      left join lateral (
        select m.index_id, ix.symbol
          from index_membership m join instruments ix on ix.id = m.index_id
         where m.constituent_id = i.id and m.valid_to is null
         order by case ix.symbol when 'SPX' then 1 when 'NDX' then 2 else 3 end
         limit 1
      ) idx(id, symbol) on true
     order by t.instrument_id, t.week_end`);

  // Per-instrument close map for forward returns.
  const closesByInstrument = new Map<number, Array<{ week: string; close: number }>>();
  for (const s of snaps) {
    if (s.close == null) continue;
    (closesByInstrument.get(s.instrument_id) ??
      closesByInstrument.set(s.instrument_id, []).get(s.instrument_id)!)
      .push({ week: s.week_end, close: s.close });
  }
  const fwdReturn = (instrumentId: number, week: string, horizon: number): number | null => {
    const series = closesByInstrument.get(instrumentId);
    if (!series) return null;
    const i = series.findIndex((x) => x.week === week);
    if (i < 0 || i + horizon >= series.length) return null;
    return series[i + horizon].close / series[i].close - 1;
  };

  // ── Regime series per index ───────────────────────────────────────────────
  const { rows: regimeRows } = await pool.query(
    `select index_id, as_of_date::text, regime, composite_score
       from regime_scores where weights_version = $1 order by index_id, as_of_date`,
    [WEIGHTS_VERSION],
  );
  const regimeByIndex = new Map<number, Array<{ date: string; regime: string; composite: number }>>();
  for (const r of regimeRows) {
    (regimeByIndex.get(r.index_id) ?? regimeByIndex.set(r.index_id, []).get(r.index_id)!)
      .push({ date: r.as_of_date, regime: r.regime, composite: Number(r.composite_score) });
  }
  const regimeAt = (indexId: number | null, week: string) => {
    if (indexId == null) return { regime: "unknown", improving: false };
    const series = regimeByIndex.get(indexId) ?? [];
    let cur: { regime: string; composite: number } | null = null;
    let past: { composite: number } | null = null;
    for (let i = 0; i < series.length; i++) {
      if (series[i].date <= week) {
        cur = series[i];
        past = i >= 4 ? series[i - 4] : null;
      } else break;
    }
    if (!cur) return { regime: "unknown", improving: false };
    return {
      regime: cur.regime,
      improving: past != null && cur.composite >= past.composite + SIGNAL_WEIGHTS.neutralImprovingBy,
    };
  };

  // ── Replay signals ────────────────────────────────────────────────────────
  const entries: Entry[] = [];
  for (const s of snaps) {
    if (s.close == null) continue;
    const factors = computeFactors(s);
    const { composite, coverage } = compose(factors);
    if (coverage < 0.5) continue;
    const direction =
      composite > SIGNAL_WEIGHTS.signalAt ? "bullish"
      : composite < -SIGNAL_WEIGHTS.signalAt ? "bearish"
      : null;
    if (!direction) continue;
    const { regime, improving } = regimeAt(s.index_id, s.week_end);
    const gated =
      direction === "bullish"
        ? !(regime === "risk_on" || (regime === "neutral" && improving))
        : !(regime === "risk_off" || (regime === "neutral" && !improving));
    const fwd: Entry["fwd"] = {};
    for (const h of HORIZONS) {
      const r = fwdReturn(s.instrument_id, s.week_end, h);
      if (r != null) fwd[h] = r;
    }
    if (fwd[4] == null) continue;
    entries.push({
      date: s.week_end,
      index: s.index_symbol ?? "-",
      regime,
      direction,
      gated,
      fwd,
    });
  }

  // ── Segments ──────────────────────────────────────────────────────────────
  const segs: SegmentMetrics[] = [];
  const known = entries.filter((e) => e.regime !== "unknown");
  const ungated = known.filter((e) => !e.gated);
  segs.push(metricsFor(ungated, "overall", "actionable"));
  segs.push(metricsFor(known.filter((e) => e.gated), "overall", "gated-suppressed"));
  for (const d of ["bullish", "bearish"] as const) {
    segs.push(metricsFor(ungated.filter((e) => e.direction === d), "signal_type", d));
  }
  for (const r of ["risk_on", "neutral", "risk_off"]) {
    segs.push(metricsFor(known.filter((e) => e.regime === r && !e.gated), "regime", r));
  }
  for (const idx of ["SPX", "NDX", "UKX"]) {
    segs.push(metricsFor(ungated.filter((e) => e.index === idx), "index", idx));
  }
  // Pre-regime-history window (regime unknown): report so nothing hides.
  segs.push(metricsFor(entries.filter((e) => e.regime === "unknown"), "overall", "pre-regime-window"));
  // Stability split (no fitting has occurred; halves should look similar).
  const dates = [...new Set(known.map((e) => e.date))].sort();
  const mid = dates[Math.floor(dates.length / 2)];
  segs.push(metricsFor(ungated.filter((e) => e.date < mid), "walk_forward", `first-half(<${mid})`));
  segs.push(metricsFor(ungated.filter((e) => e.date >= mid), "walk_forward", `second-half(>=${mid})`));

  // ── Gauge backtest (north-star) ───────────────────────────────────────────
  const { rows: gaugeRows } = await pool.query(
    `select r.index_id, i.symbol, r.as_of_date::text as date,
            r.breakdown->'gauge'->>'direction' as direction,
            (r.breakdown->'gauge'->>'intensity')::int as intensity
       from regime_scores r join instruments i on i.id = r.index_id
      where r.weights_version = $1 order by r.index_id, r.as_of_date`,
    [WEIGHTS_VERSION],
  );
  const { rows: idxCloses } = await pool.query(`
    select w.instrument_id, w.week_end::text, w.adj_close::float8 as close
      from ohlcv_weekly w join instruments i on i.id = w.instrument_id
     where i.instrument_type = 'index' and w.adj_close is not null
     order by w.instrument_id, w.week_end`);
  const idxSeries = new Map<number, Array<{ week: string; close: number }>>();
  for (const r of idxCloses) {
    (idxSeries.get(r.instrument_id) ?? idxSeries.set(r.instrument_id, []).get(r.instrument_id)!)
      .push({ week: r.week_end, close: r.close });
  }
  const idxFwd = (indexId: number, week: string, h: number): number | null => {
    const series = idxSeries.get(indexId);
    if (!series) return null;
    const i = series.findIndex((x) => x.week === week);
    return i >= 0 && i + h < series.length ? series[i + h].close / series[i].close - 1 : null;
  };
  const gaugeEntries: Entry[] = [];
  const baselineEntries: Entry[] = [];
  for (const g of gaugeRows) {
    const fwd: Entry["fwd"] = {};
    for (const h of HORIZONS) {
      const r = idxFwd(g.index_id, g.date, h);
      if (r != null) fwd[h] = r;
    }
    if (fwd[4] == null) continue;
    const base: Entry = {
      date: g.date, index: g.symbol, regime: "-", direction: "bullish", gated: false, fwd,
    };
    baselineEntries.push(base);
    if (g.direction === "overbought-reversal-risk") {
      gaugeEntries.push({ ...base, direction: "bearish" }); // warning "wins" if index falls
    } else if (g.direction === "oversold-rebound-setup") {
      gaugeEntries.push({ ...base, direction: "bullish" });
    }
  }
  segs.push(metricsFor(gaugeEntries.filter((e) => e.direction === "bearish"), "gauge", "overbought-warnings"));
  segs.push(metricsFor(gaugeEntries.filter((e) => e.direction === "bullish"), "gauge", "oversold-signals"));
  segs.push(metricsFor(baselineEntries, "gauge", "baseline-all-index-weeks"));

  // ── Persist ───────────────────────────────────────────────────────────────
  const { rows: runRows } = await pool.query(
    `insert into backtest_runs (status, weights_version, period_start, period_end, config)
     values ('running', $1, $2, $3, $4) returning id`,
    [
      WEIGHTS_VERSION,
      dates[0] ?? "2021-01-01",
      dates.at(-1) ?? "2026-07-21",
      JSON.stringify({
        horizons: HORIZONS,
        signalEntries: entries.length,
        caveats: [
          "membership survivorship before 2026-07-21 (current members backfilled)",
          "regime history ~116w; earlier weeks segmented as pre-regime-window",
          "no fitted parameters: whole window is out-of-sample for v1 weights",
        ],
      }),
    ],
  );
  const runId = runRows[0].id;
  for (const s of segs) {
    await pool.query(
      `insert into backtest_results
         (run_id, segment_type, segment_key, n_signals, hit_rate,
          avg_fwd_return_2w, avg_fwd_return_4w, avg_fwd_return_6w,
          expectancy, profit_factor, max_drawdown, detail)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        runId, s.segmentType, s.segmentKey, s.n, s.hitRate,
        s.avg2w, s.avg4w, s.avg6w, s.expectancy,
        s.profitFactor === Infinity ? null : s.profitFactor,
        s.maxDrawdown, JSON.stringify(s.detail),
      ],
    );
  }
  await pool.query(
    `update backtest_runs set status = 'success', finished_at = now() where id = $1`,
    [runId],
  );
  return { runId, segments: segs };
}
