import { getPool } from "../db";
import { REGIME_WEIGHTS, GAUGE_WEIGHTS, WEIGHTS_VERSION } from "../../config/weights";

/**
 * Layer 1 — Market Regime Score + Reversal-Risk gauge (the north-star
 * output) per index per week.
 *
 * Sub-scores are 0–100 (50 = neutral); composite = weight-averaged over the
 * sub-scores that are AVAILABLE that week (weights renormalised, coverage
 * recorded — narrative only exists from 2026-07 onward, positioning only
 * for US indices). Every input lands in breakdown jsonb for traceability.
 *
 * Intermarket inputs are global/US-centric and shared by all indices
 * (documented limitation; UK-specific credit/rates series are a later add).
 */

const clip = (v: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));
const toScore = (signal: number) => Math.round((clip(signal) + 1) * 50); // -1..1 → 0..100

function mean(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => v != null && isFinite(v));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function zScore(latest: number, history: number[]): number | null {
  if (history.length < 20) return null;
  const m = history.reduce((a, b) => a + b, 0) / history.length;
  const sd = Math.sqrt(history.reduce((a, b) => a + (b - m) ** 2, 0) / history.length);
  return sd > 0 ? (latest - m) / sd : null;
}

function percentile(latest: number, history: number[]): number | null {
  if (history.length < 20) return null;
  return (100 * history.filter((v) => v <= latest).length) / history.length;
}

// ── Context loading ──────────────────────────────────────────────────────────

export interface IndexRef {
  id: number;
  symbol: string;
  country: string;
}

interface SnapshotRow {
  week_end: string;
  rsi_14: number | null;
  rsi_divergence: string | null;
  macd_hist: number | null;
  bb_pct_b: number | null;
  ma_30w_slope: number | null;
  ma_40w_slope: number | null;
  price_vs_ma_30w: number | null;
  price_vs_ma_40w: number | null;
  pos_52w_range: number | null;
  close?: number | null;
}

export interface RegimeContext {
  index: IndexRef;
  snapshots: SnapshotRow[]; // index weekly technicals, ascending
  breadth: Array<{
    metric_date: string; pct_above_50d: number | null; pct_above_200d: number | null;
    mcclellan_osc: number | null; high_low_index: number | null;
    adv_dec_line: number | null; breadth_divergence: boolean | null;
  }>;
  macro: Map<string, Array<{ obs_date: string; value: number }>>; // latest vintage per series
  weeklyCloses: Map<string, Map<string, number>>; // aux symbol → week_end → adj_close
  cot: Array<{ reading_at: string; score: number }>; // per index, ascending
  narrative: Array<{ reading_at: string; score: number; volume: number }>; // market tone per country
  membersAbove30w: Map<string, { above: number; total: number }>; // week_end → counts
}

export async function loadRegimeContext(index: IndexRef): Promise<RegimeContext> {
  const pool = getPool();
  const [snapshots, breadth, cot, narrative, members] = await Promise.all([
    pool.query(
      `select t.week_end::text, t.rsi_14::float8, t.rsi_divergence, t.macd_hist::float8,
              t.bb_pct_b::float8, t.ma_30w_slope::float8, t.ma_40w_slope::float8,
              t.price_vs_ma_30w::float8, t.price_vs_ma_40w::float8, t.pos_52w_range::float8,
              w.adj_close::float8 as close
         from technical_snapshots t
         left join ohlcv_weekly w on w.instrument_id = t.instrument_id and w.week_end = t.week_end
        where t.instrument_id = $1 order by t.week_end`,
      [index.id],
    ),
    pool.query(
      `select metric_date::text, pct_above_50d::float8, pct_above_200d::float8,
              mcclellan_osc::float8, high_low_index::float8, adv_dec_line::float8,
              breadth_divergence
         from breadth_metrics where index_id = $1 order by metric_date`,
      [index.id],
    ),
    pool.query(
      `select reading_at::text, score::float8 from sentiment_readings
        where source = 'cot' and scope_type = 'index' and scope_key = $1
        order by reading_at`,
      [index.symbol],
    ),
    pool.query(
      `select reading_at::text, score::float8, coalesce(volume,0) as volume
         from sentiment_readings
        where source = 'aggregate' and scope_type = 'market' and scope_key = $1
          and score is not null
        order by reading_at`,
      [index.country],
    ),
    pool.query(
      `select t.week_end::text,
              count(*) filter (where t.price_vs_ma_30w > 0) as above, count(*) as total
         from technical_snapshots t
        where t.instrument_id in (
          select constituent_id from index_membership where index_id = $1 and valid_to is null)
        group by t.week_end order by t.week_end`,
      [index.id],
    ),
  ]);

  // Macro series (latest vintage per obs_date).
  const { rows: macroRows } = await pool.query(`
    select s.series_code, o.obs_date::text, o.value::float8
      from macro_observations o join macro_series s on s.id = o.series_id
     where s.series_code in ('fred:T10Y2Y','fred:T10Y3M','fred:BAMLH0A0HYM2')
       and o.value is not null
       and o.as_of = (select max(as_of) from macro_observations o2
                       where o2.series_id = o.series_id and o2.obs_date = o.obs_date)
     order by o.obs_date`);
  const macro = new Map<string, Array<{ obs_date: string; value: number }>>();
  for (const r of macroRows) {
    (macro.get(r.series_code) ?? macro.set(r.series_code, []).get(r.series_code)!)
      .push({ obs_date: r.obs_date, value: r.value });
  }

  // Intermarket aux weekly closes.
  const { rows: auxRows } = await pool.query(`
    select i.symbol, w.week_end::text, w.adj_close::float8 as close
      from ohlcv_weekly w join instruments i on i.id = w.instrument_id
     where i.symbol in ('DX-Y.NYB','GC=F','HG=F','CL=F','^VIX','XLP','XLU','XLV','XLY','XLK','XLI','XLF')
       and w.adj_close is not null`);
  const weeklyCloses = new Map<string, Map<string, number>>();
  for (const r of auxRows) {
    (weeklyCloses.get(r.symbol) ?? weeklyCloses.set(r.symbol, new Map()).get(r.symbol)!)
      .set(r.week_end, r.close);
  }

  return {
    index,
    snapshots: snapshots.rows,
    breadth: breadth.rows,
    macro,
    weeklyCloses,
    cot: cot.rows,
    narrative: narrative.rows,
    membersAbove30w: new Map(
      members.rows.map((r: { week_end: string; above: string; total: string }) => [
        r.week_end,
        { above: Number(r.above), total: Number(r.total) },
      ]),
    ),
  };
}

// ── Sub-scores (each returns score 0-100 + raw inputs, or null) ─────────────

type Sub = { score: number; inputs: Record<string, unknown> } | null;

function trendSub(ctx: RegimeContext, weekEnd: string): Sub {
  const s = ctx.snapshots.filter((x) => x.week_end <= weekEnd).at(-1);
  if (!s || s.price_vs_ma_40w == null) return null;
  const parts = [
    s.price_vs_ma_30w != null ? clip(s.price_vs_ma_30w * 10) : null,
    s.price_vs_ma_40w != null ? clip(s.price_vs_ma_40w * 10) : null,
    s.ma_30w_slope != null ? clip(s.ma_30w_slope * 25) : null,
    s.ma_40w_slope != null ? clip(s.ma_40w_slope * 25) : null,
    s.macd_hist != null && s.close ? clip((s.macd_hist / s.close) * 100) : null,
    s.rsi_14 != null ? clip((s.rsi_14 - 50) / 25) : null,
  ];
  const m = mean(parts);
  return m == null ? null : { score: toScore(m), inputs: { week: s.week_end, rsi: s.rsi_14, priceVsMa40w: s.price_vs_ma_40w } };
}

function breadthSub(ctx: RegimeContext, asOf: string): Sub {
  const rows = ctx.breadth.filter((b) => b.metric_date <= asOf);
  const b = rows.at(-1);
  const past = rows.at(-21); // ~1 month of trading days
  if (!b || b.pct_above_200d == null) return null;
  const parts = [
    clip((b.pct_above_200d - 50) / 30),
    b.pct_above_50d != null && past?.pct_above_50d != null
      ? clip((b.pct_above_50d - past.pct_above_50d) / 20)
      : null,
    b.mcclellan_osc != null ? clip(b.mcclellan_osc / 100) : null,
    b.high_low_index != null ? clip((b.high_low_index - 50) / 40) : null,
  ];
  let m = mean(parts);
  if (m == null) return null;
  if (b.breadth_divergence) m -= 0.3; // divergence is a leading penalty
  return {
    score: toScore(m),
    inputs: {
      date: b.metric_date, pctAbove200d: b.pct_above_200d, pctAbove50d: b.pct_above_50d,
      mcclellan: b.mcclellan_osc, highLow: b.high_low_index, divergence: b.breadth_divergence,
    },
  };
}

function seriesUpTo(ctx: RegimeContext, code: string, asOf: string) {
  return (ctx.macro.get(code) ?? []).filter((o) => o.obs_date <= asOf);
}

function auxReturn(ctx: RegimeContext, symbol: string, weekEnd: string, weeks: number): number | null {
  const m = ctx.weeklyCloses.get(symbol);
  if (!m) return null;
  const dates = [...m.keys()].filter((d) => d <= weekEnd).sort();
  const now = dates.at(-1);
  const past = dates.at(-1 - weeks);
  if (!now || !past) return null;
  return m.get(now)! / m.get(past)! - 1;
}

function intermarketSub(ctx: RegimeContext, weekEnd: string): Sub {
  const curve = seriesUpTo(ctx, "fred:T10Y2Y", weekEnd);
  const hy = seriesUpTo(ctx, "fred:BAMLH0A0HYM2", weekEnd);
  const curveNow = curve.at(-1)?.value ?? null;
  const curvePast = curve.at(-66)?.value ?? null; // ~13 weeks of daily obs
  const hyNow = hy.at(-1)?.value ?? null;
  const hyZ = hyNow != null ? zScore(hyNow, hy.slice(-500).map((o) => o.value)) : null;
  const dxyRet = auxReturn(ctx, "DX-Y.NYB", weekEnd, 13);
  const copper = auxReturn(ctx, "HG=F", weekEnd, 13);
  const gold = auxReturn(ctx, "GC=F", weekEnd, 13);
  const defensives = mean(["XLP", "XLU", "XLV"].map((s) => auxReturn(ctx, s, weekEnd, 13)));
  const cyclicals = mean(["XLY", "XLK", "XLI", "XLF"].map((s) => auxReturn(ctx, s, weekEnd, 13)));

  const parts = [
    curveNow != null ? clip(curveNow / 1.5) : null, // inverted curve → risk-off
    curveNow != null && curvePast != null ? clip((curveNow - curvePast) / 0.5) : null,
    hyZ != null ? clip(-hyZ / 2) : null, // widening spreads → risk-off
    dxyRet != null ? clip(-dxyRet * 8) : null, // strong dollar headwind
    copper != null && gold != null ? clip((copper - gold) * 5) : null, // cyclical read
    defensives != null && cyclicals != null ? clip((cyclicals - defensives) * 8) : null,
  ];
  const m = mean(parts);
  return m == null ? null : {
    score: toScore(m),
    inputs: { curve: curveNow, curve13wChange: curvePast != null && curveNow != null ? curveNow - curvePast : null, hyOasZ: hyZ, dxy13w: dxyRet, copperVsGold13w: copper != null && gold != null ? copper - gold : null, cyclicalsVsDefensives13w: defensives != null && cyclicals != null ? cyclicals - defensives : null },
  };
}

function positioningSub(ctx: RegimeContext, weekEnd: string): Sub {
  const cot = ctx.cot.filter((c) => c.reading_at.slice(0, 10) <= weekEnd);
  const cotNow = cot.at(-1)?.score ?? null;
  const cotZ = cotNow != null ? zScore(cotNow, cot.slice(-156).map((c) => c.score)) : null;
  const vix = ctx.weeklyCloses.get("^VIX");
  const vixDates = vix ? [...vix.keys()].filter((d) => d <= weekEnd).sort() : [];
  const vixNow = vixDates.length ? vix!.get(vixDates.at(-1)!)! : null;
  const vixPct = vixNow != null
    ? percentile(vixNow, vixDates.slice(-104).map((d) => vix!.get(d)!))
    : null;

  const parts: Array<number | null> = [];
  // Contrarian at extremes only; mid-range positioning is noise.
  if (cotZ != null) parts.push(Math.abs(cotZ) > 1.5 ? clip(-Math.sign(cotZ) * (Math.abs(cotZ) - 1.5)) : 0);
  if (vixPct != null) parts.push(vixPct < 10 ? -0.5 : vixPct > 90 ? 0.5 : 0);
  const m = mean(parts);
  return m == null ? null : { score: toScore(m), inputs: { cotNet: cotNow, cotZ, vix: vixNow, vixPctile: vixPct } };
}

function narrativeSub(ctx: RegimeContext, asOf: string): Sub {
  const rows = ctx.narrative.filter((n) => n.reading_at.slice(0, 10) <= asOf);
  if (rows.length === 0) return null;
  const last7 = rows.slice(-7);
  const tone7 = mean(last7.map((r) => r.score));
  if (tone7 == null) return null;
  const toneZ = zScore(tone7, rows.slice(-90).map((r) => r.score));
  return {
    score: toScore(clip(tone7 * 2)),
    inputs: { tone7d: tone7, toneZ, days: rows.length },
  };
}

// ── Reversal-risk gauge (north-star) ─────────────────────────────────────────

export interface GaugeResult {
  direction: "overbought-reversal-risk" | "oversold-rebound-setup" | "none";
  intensity: number;
  evidence: Array<{ item: string; detail: string; weight: number }>;
}

function computeGauge(
  ctx: RegimeContext,
  weekEnd: string,
  subs: { positioning: Sub; narrative: Sub },
): GaugeResult {
  const s = ctx.snapshots.filter((x) => x.week_end <= weekEnd).at(-1);
  const b = ctx.breadth.filter((x) => x.metric_date <= weekEnd).at(-1);
  const bPrev = ctx.breadth.filter((x) => x.metric_date <= weekEnd).at(-21);
  const memberWeeks = [...ctx.membersAbove30w.keys()].filter((w) => w <= weekEnd).sort();
  const mNow = memberWeeks.at(-1) ? ctx.membersAbove30w.get(memberWeeks.at(-1)!) : undefined;
  const mPast = memberWeeks.at(-5) ? ctx.membersAbove30w.get(memberWeeks.at(-5)!) : undefined;
  const pctAbove30wNow = mNow && mNow.total > 20 ? (100 * mNow.above) / mNow.total : null;
  const pctAbove30wPast = mPast && mPast.total > 20 ? (100 * mPast.above) / mPast.total : null;
  const idx4wRet = (() => {
    const sn = ctx.snapshots.filter((x) => x.week_end <= weekEnd);
    const now = sn.at(-1)?.close;
    const past = sn.at(-5)?.close;
    return now != null && past != null ? now / past - 1 : null;
  })();
  const cotZ = (subs.positioning?.inputs.cotZ as number | null) ?? null;
  const vixPct = (subs.positioning?.inputs.vixPctile as number | null) ?? null;
  const toneZ = (subs.narrative?.inputs.toneZ as number | null) ?? null;

  const W = GAUGE_WEIGHTS;
  const over: GaugeResult["evidence"] = [];
  const under: GaugeResult["evidence"] = [];

  if (s?.rsi_14 != null && s.rsi_14 > 70) {
    over.push({ item: "rsiHot", detail: `weekly RSI ${s.rsi_14.toFixed(1)} > 70`, weight: W.overbought.rsiHot });
    if (s.rsi_14 > 75) over.push({ item: "rsiExtreme", detail: `RSI ${s.rsi_14.toFixed(1)} > 75`, weight: W.overbought.rsiExtreme });
  }
  if (s?.pos_52w_range != null && s.bb_pct_b != null && s.pos_52w_range > 0.9 && s.bb_pct_b > 0.95) {
    over.push({ item: "priceStretched", detail: `at ${(s.pos_52w_range * 100).toFixed(0)}% of 52w range, %B ${s.bb_pct_b.toFixed(2)}`, weight: W.overbought.priceStretched });
  }
  if (s?.rsi_divergence === "bearish") {
    over.push({ item: "bearishDivergence", detail: "weekly RSI bearish divergence on the index", weight: W.overbought.bearishDivergence });
  }
  if (b?.breadth_divergence) {
    over.push({ item: "breadthDivergence", detail: "index near highs while % above 50d MA deteriorates", weight: W.overbought.breadthDivergence });
  }
  if (b?.mcclellan_osc != null && b.mcclellan_osc < 0 && s?.pos_52w_range != null && s.pos_52w_range > 0.85) {
    over.push({ item: "mcclellanCross", detail: `McClellan ${b.mcclellan_osc.toFixed(0)} < 0 with index near high`, weight: W.overbought.mcclellanCross });
  }
  if (cotZ != null && cotZ > 1.5) {
    over.push({ item: "positioningExtreme", detail: `COT net z ${cotZ.toFixed(1)} (crowded long)`, weight: W.overbought.positioningExtreme });
  }
  if (toneZ != null && toneZ > 1) {
    over.push({ item: "narrativeEuphoria", detail: `news tone z ${toneZ.toFixed(1)}`, weight: W.overbought.narrativeEuphoria });
  }
  if (vixPct != null && vixPct < 10) {
    over.push({ item: "vixComplacency", detail: `VIX in ${vixPct.toFixed(0)}th percentile (complacent)`, weight: W.overbought.vixComplacency });
  }
  if (pctAbove30wNow != null && pctAbove30wPast != null && idx4wRet != null &&
      idx4wRet > 0 && pctAbove30wNow < pctAbove30wPast - 5) {
    over.push({ item: "internalsLagging", detail: `index +${(idx4wRet * 100).toFixed(1)}% over 4w while members above 30w MA fell ${pctAbove30wPast.toFixed(0)}%→${pctAbove30wNow.toFixed(0)}%`, weight: W.overbought.internalsLagging });
  }

  if (s?.rsi_14 != null && s.rsi_14 < 30) {
    under.push({ item: "rsiCold", detail: `weekly RSI ${s.rsi_14.toFixed(1)} < 30`, weight: W.oversold.rsiCold });
    if (s.rsi_14 < 25) under.push({ item: "rsiExtreme", detail: `RSI ${s.rsi_14.toFixed(1)} < 25`, weight: W.oversold.rsiExtreme });
  }
  if (s?.pos_52w_range != null && s.bb_pct_b != null && s.pos_52w_range < 0.1 && s.bb_pct_b < 0.05) {
    under.push({ item: "priceWashedOut", detail: `at ${(s.pos_52w_range * 100).toFixed(0)}% of 52w range, %B ${s.bb_pct_b.toFixed(2)}`, weight: W.oversold.priceWashedOut });
  }
  if (s?.rsi_divergence === "bullish") {
    under.push({ item: "bullishDivergence", detail: "weekly RSI bullish divergence on the index", weight: W.oversold.bullishDivergence });
  }
  if (b?.pct_above_50d != null && b.pct_above_50d < 15) {
    under.push({ item: "breadthWashout", detail: `only ${b.pct_above_50d.toFixed(0)}% above 50d MA`, weight: W.oversold.breadthWashout });
  }
  if (b?.mcclellan_osc != null && bPrev?.mcclellan_osc != null && bPrev.mcclellan_osc < -50 && b.mcclellan_osc > bPrev.mcclellan_osc + 30) {
    under.push({ item: "mcclellanTurn", detail: `McClellan turning up from ${bPrev.mcclellan_osc.toFixed(0)}`, weight: W.oversold.mcclellanTurn });
  }
  if (cotZ != null && cotZ < -1.5) {
    under.push({ item: "positioningExtreme", detail: `COT net z ${cotZ.toFixed(1)} (crowded short)`, weight: W.oversold.positioningExtreme });
  }
  if (toneZ != null && toneZ < -1) {
    under.push({ item: "narrativeDespair", detail: `news tone z ${toneZ.toFixed(1)}`, weight: W.oversold.narrativeDespair });
  }
  if (vixPct != null && vixPct > 90) {
    under.push({ item: "vixPanic", detail: `VIX in ${vixPct.toFixed(0)}th percentile`, weight: W.oversold.vixPanic });
  }
  if (pctAbove30wNow != null && pctAbove30wPast != null && idx4wRet != null &&
      idx4wRet < 0 && pctAbove30wNow > pctAbove30wPast + 5) {
    under.push({ item: "internalsFirming", detail: `index ${(idx4wRet * 100).toFixed(1)}% over 4w while members above 30w MA rose ${pctAbove30wPast.toFixed(0)}%→${pctAbove30wNow.toFixed(0)}%`, weight: W.oversold.internalsFirming });
  }

  const totalOver = Object.values(W.overbought).reduce((a, b) => a + b, 0);
  const totalUnder = Object.values(W.oversold).reduce((a, b) => a + b, 0);
  const overScore = (100 * over.reduce((a, e) => a + e.weight, 0)) / totalOver;
  const underScore = (100 * under.reduce((a, e) => a + e.weight, 0)) / totalUnder;

  if (overScore >= W.fireAt && overScore >= underScore) {
    return { direction: "overbought-reversal-risk", intensity: Math.round(overScore), evidence: over };
  }
  if (underScore >= W.fireAt) {
    return { direction: "oversold-rebound-setup", intensity: Math.round(underScore), evidence: under };
  }
  return {
    direction: "none",
    intensity: Math.round(Math.max(overScore, underScore)),
    evidence: overScore >= underScore ? over : under,
  };
}

// ── Catalysts (only meaningful for the current week) ─────────────────────────

async function loadCatalysts(index: IndexRef, asOf: string): Promise<unknown[]> {
  const { rows } = await getPool().query(
    `with earnings_members as (
       select e.id
         from economic_events e
         join instruments i on e.event_name = 'Earnings: ' || i.symbol
         join index_membership m on m.constituent_id = i.id and m.valid_to is null
        where m.index_id = $3
     )
     select event_name, release_at::text, importance, consensus, unit
       from economic_events e
      where e.release_at between $1::timestamptz and $1::timestamptz + interval '30 days'
        and (
          (e.event_name not like 'Earnings:%' and e.country = $2 and e.importance = 'high')
          or e.id in (select id from earnings_members)
        )
      order by e.release_at
      limit 25`,
    [asOf, index.country, index.id],
  );
  return rows;
}

// ── Main entry ───────────────────────────────────────────────────────────────

export async function computeRegimeForWeek(
  ctx: RegimeContext,
  weekEnd: string,
  withCatalysts: boolean,
): Promise<{ row: unknown[]; gauge: GaugeResult; composite: number; regime: string } | null> {
  const trend = trendSub(ctx, weekEnd);
  const breadth = breadthSub(ctx, weekEnd);
  const intermarket = intermarketSub(ctx, weekEnd);
  const positioning = positioningSub(ctx, weekEnd);
  const narrative = narrativeSub(ctx, weekEnd);
  if (!trend || !breadth) return null; // core sub-scores are mandatory

  const W = REGIME_WEIGHTS.subScores;
  const available: Array<[keyof typeof W, Sub]> = (
    [["trend", trend], ["breadth", breadth], ["intermarket", intermarket],
     ["positioning", positioning], ["narrative", narrative]] as Array<[keyof typeof W, Sub]>
  ).filter(([, s]) => s != null);
  const weightSum = available.reduce((a, [k]) => a + W[k], 0);
  const composite = Math.round(
    available.reduce((a, [k, s]) => a + (W[k] / weightSum) * s!.score, 0),
  );
  const regime =
    composite >= REGIME_WEIGHTS.thresholds.riskOn ? "risk_on"
    : composite <= REGIME_WEIGHTS.thresholds.riskOff ? "risk_off"
    : "neutral";
  const coverage = weightSum; // ≤ 1; lower coverage → lower confidence
  const confidence = Math.round(Math.abs(composite - 50) * 2 * coverage) / 100;

  const gauge = computeGauge(ctx, weekEnd, { positioning, narrative });
  const catalysts = withCatalysts ? await loadCatalysts(ctx.index, weekEnd) : [];

  const breakdown = {
    inputs: {
      trend: trend?.inputs ?? null,
      breadth: breadth?.inputs ?? null,
      intermarket: intermarket?.inputs ?? null,
      positioning: positioning?.inputs ?? null,
      narrative: narrative?.inputs ?? null,
    },
    coverage,
    gauge,
    catalysts,
  };

  return {
    composite,
    regime,
    gauge,
    row: [
      ctx.index.id, weekEnd,
      trend?.score ?? null, breadth?.score ?? null, intermarket?.score ?? null,
      positioning?.score ?? null, narrative?.score ?? null,
      composite, regime, confidence, WEIGHTS_VERSION, JSON.stringify(breakdown),
    ],
  };
}
