import { getPool } from "../db";
import { SIGNAL_WEIGHTS, WEIGHTS_VERSION } from "../../config/weights";

/**
 * Layer 3 — per-stock signal synthesis for the 2–6 week horizon.
 *
 * composite = Σ weight × factor, factors in [-1,+1] from the latest weekly
 * technical snapshot. Direction from thresholds; conviction 0–100 from
 * |composite| with a volume-confirmation kicker.
 *
 * Regime gate ("don't fight the tape"): longs actionable only when the
 * stock's index regime is risk_on, or neutral AND improving; shorts/
 * defensive actionable when risk_off or neutral-deteriorating. Gated
 * signals are stored and shown, marked gated with the reason.
 *
 * Event overlay: fresh signals inside the blackout window before a
 * high-importance macro release (stock's country) or the stock's own
 * earnings are flagged event_blackout; upcoming events ride on the row.
 * If an upcoming event carries an expected_bias (populated by a future
 * fundamentals-ingestion job) that agrees with the signal direction, the
 * blackout is skipped and the row is marked fundamental support instead;
 * a disagreeing bias is marked fundamental conflict (informational only).
 */

const clip = (v: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Minimal indicator inputs the factor model needs — the backtester feeds
 *  historical rows through the exact same function as live signals. */
export interface FactorInputs {
  rsi_14: number | null;
  rsi_divergence: string | null;
  macd_hist: number | null;
  bb_pct_b: number | null;
  bb_squeeze: boolean | null;
  bb_band_walk: string | null;
  volume_vs_20w: number | null;
  volume_confirms: boolean | null;
  ma_30w_slope: number | null;
  ma_40w_slope: number | null;
  price_vs_ma_30w: number | null;
  price_vs_ma_40w: number | null;
  ma_cross: string | null;
  adx_14: number | null;
  di_plus: number | null;
  di_minus: number | null;
  mansfield_rs: number | null;
  rs_trend: string | null;
  pos_52w_range: number | null;
  close: number | null;
}

interface SnapRow extends FactorInputs {
  instrument_id: number;
  symbol: string;
  country: string;
  index_id: number | null;
  index_symbol: string | null;
  week_end: string;
}

export interface FactorBreakdown {
  trendMa: number | null;
  momentum: number | null;
  divergence: number | null;
  relativeStrength: number | null;
  volume: number | null;
  bollinger: number | null;
  range: number | null;
}

export function computeFactors(s: FactorInputs): FactorBreakdown {
  const trendParts = [
    s.price_vs_ma_30w != null ? clip(s.price_vs_ma_30w * 6) : null,
    s.price_vs_ma_40w != null ? clip(s.price_vs_ma_40w * 6) : null,
    s.ma_30w_slope != null ? clip(s.ma_30w_slope * 20) : null,
    s.ma_40w_slope != null ? clip(s.ma_40w_slope * 20) : null,
    s.ma_cross === "golden" ? 1 : s.ma_cross === "death" ? -1 : null,
  ];
  const trendMa = avg(trendParts);

  // ADX filters chop: momentum counts fully only in a trending name.
  const adxFactor = s.adx_14 != null ? Math.min(1, Math.max(0.3, s.adx_14 / 30)) : 0.7;
  const momentumParts = [
    s.macd_hist != null && s.close ? clip((s.macd_hist / s.close) * 60) : null,
    s.rsi_14 != null ? clip((s.rsi_14 - 50) / 20) * (s.rsi_14 > 75 || s.rsi_14 < 25 ? 0.3 : 1) : null,
    s.di_plus != null && s.di_minus != null
      ? clip((s.di_plus - s.di_minus) / 25)
      : null,
  ];
  const momentumRaw = avg(momentumParts);
  const momentum = momentumRaw != null ? momentumRaw * adxFactor : null;

  const divergence =
    s.rsi_divergence === "bullish" ? 1 : s.rsi_divergence === "bearish" ? -1 : 0;

  const rsParts = [
    s.mansfield_rs != null ? clip(s.mansfield_rs / 15) : null,
    s.rs_trend === "leading" ? 0.5 : s.rs_trend === "lagging" ? -0.5 : 0,
  ];
  const relativeStrength = avg(rsParts);

  const volParts = [
    s.volume_confirms == null ? null : s.volume_confirms ? 0.6 : -0.3,
    s.volume_vs_20w != null ? clip((s.volume_vs_20w - 1) * 0.8) : null,
  ];
  // Volume direction follows price: it CONFIRMS the move rather than having
  // a sign of its own — sign it by the trend factor.
  const volRaw = avg(volParts);
  const volume =
    volRaw != null && trendMa != null ? Math.abs(volRaw) * Math.sign(trendMa) * Math.min(1, Math.abs(volRaw) + 0.4) : null;

  const bollParts = [
    s.bb_band_walk === "upper" ? 0.8 : s.bb_band_walk === "lower" ? -0.8 : null,
    s.bb_pct_b != null ? (s.bb_pct_b > 1 ? 0.4 : s.bb_pct_b < 0 ? -0.4 : 0) : null,
    // Squeeze is direction-agnostic energy: lean it toward the trend.
    s.bb_squeeze && trendMa != null ? 0.5 * Math.sign(trendMa) : null,
  ];
  const bollinger = avg(bollParts);

  const range =
    s.pos_52w_range != null
      ? s.pos_52w_range > 0.95
        ? 0.2 // stretched: still positive but damped
        : s.pos_52w_range < 0.05
          ? -0.2
          : clip((s.pos_52w_range - 0.5) * 1.6)
      : null;

  return { trendMa, momentum, divergence, relativeStrength, volume, bollinger, range };
}

function avg(values: Array<number | null>): number | null {
  const xs = values.filter((v): v is number => v != null && isFinite(v));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function compose(f: FactorBreakdown): { composite: number; coverage: number } {
  const W = SIGNAL_WEIGHTS.factors;
  let sum = 0;
  let weightSum = 0;
  for (const [k, w] of Object.entries(W) as Array<[keyof FactorBreakdown, number]>) {
    const v = f[k];
    if (v != null) {
      sum += w * v;
      weightSum += w;
    }
  }
  return weightSum > 0
    ? { composite: sum / weightSum, coverage: weightSum }
    : { composite: 0, coverage: 0 };
}

export interface RegimeGateInfo {
  regime: string;
  composite: number;
  improving: boolean;
}

export function gateFor(
  direction: "bullish" | "bearish" | "neutral",
  regime: RegimeGateInfo | undefined,
): { gated: boolean; reason: string | null } {
  if (!regime) return { gated: false, reason: null };
  if (direction === "bullish") {
    if (regime.regime === "risk_on") return { gated: false, reason: null };
    if (regime.regime === "neutral" && regime.improving) return { gated: false, reason: null };
    return {
      gated: true,
      reason: `regime ${regime.regime}${regime.regime === "neutral" ? " (not improving)" : ""} blocks fresh longs`,
    };
  }
  if (direction === "bearish") {
    if (regime.regime === "risk_off") return { gated: false, reason: null };
    if (regime.regime === "neutral" && !regime.improving) return { gated: false, reason: null };
    return { gated: true, reason: `regime ${regime.regime} blocks fresh shorts/defensive` };
  }
  return { gated: false, reason: null };
}

export async function computeSignals(): Promise<{
  written: number;
  actionable: number;
  gated: number;
  blackout: number;
  sample: Array<Record<string, unknown>>;
}> {
  const pool = getPool();

  // Latest weekly snapshot per equity + its RS index (SPX > NDX > UKX).
  const { rows: snaps }: { rows: SnapRow[] } = await pool.query(`
    with latest as (
      select instrument_id, max(week_end) as week_end
        from technical_snapshots group by instrument_id
    )
    select t.instrument_id, i.symbol, coalesce(i.metadata->>'country','US') as country,
           idx.id as index_id, idx.symbol as index_symbol,
           t.week_end::text, t.rsi_14::float8, t.rsi_divergence, t.macd_hist::float8,
           t.bb_pct_b::float8, t.bb_squeeze, t.bb_band_walk,
           t.volume_vs_20w::float8, t.volume_confirms,
           t.ma_30w_slope::float8, t.ma_40w_slope::float8,
           t.price_vs_ma_30w::float8, t.price_vs_ma_40w::float8, t.ma_cross,
           t.adx_14::float8, t.di_plus::float8, t.di_minus::float8,
           t.mansfield_rs::float8, t.rs_trend, t.pos_52w_range::float8,
           w.adj_close::float8 as close
      from technical_snapshots t
      join latest l on l.instrument_id = t.instrument_id and l.week_end = t.week_end
      join instruments i on i.id = t.instrument_id and i.instrument_type = 'equity'
      left join lateral (
        select m.index_id, ix.symbol
          from index_membership m join instruments ix on ix.id = m.index_id
         where m.constituent_id = i.id and m.valid_to is null
         order by case ix.symbol when 'SPX' then 1 when 'NDX' then 2 else 3 end
         limit 1
      ) idx(id, symbol) on true
      left join ohlcv_weekly w on w.instrument_id = t.instrument_id and w.week_end = t.week_end`);

  // Regime gate info per index (latest week + 4w-ago composite).
  const { rows: regimes } = await pool.query(`
    with ranked as (
      select index_id, as_of_date, composite_score, regime,
             row_number() over (partition by index_id order by as_of_date desc) as rn
        from regime_scores where weights_version = $1
    )
    select r1.index_id, r1.regime, r1.composite_score,
           r5.composite_score as composite_4w_ago
      from ranked r1 left join ranked r5 on r5.index_id = r1.index_id and r5.rn = 5
     where r1.rn = 1`,
    [WEIGHTS_VERSION],
  );
  const regimeByIndex = new Map<number, RegimeGateInfo>(
    regimes.map((r: { index_id: number; regime: string; composite_score: number; composite_4w_ago: number | null }) => [
      r.index_id,
      {
        regime: r.regime,
        composite: Number(r.composite_score),
        improving:
          r.composite_4w_ago != null &&
          Number(r.composite_score) >= Number(r.composite_4w_ago) + SIGNAL_WEIGHTS.neutralImprovingBy,
      },
    ]),
  );

  // Upcoming events for blackout: high-importance macro per country + earnings per symbol.
  const { rows: events } = await pool.query(`
    select country, event_name, release_at::text, importance, expected_bias
      from economic_events
     where release_at between now() and now() + ($1 || ' days')::interval
       and (importance = 'high' or event_name like 'Earnings:%')`,
    [SIGNAL_WEIGHTS.eventBlackoutDays],
  );
  const macroByCountry = new Map<string, Array<Record<string, unknown>>>();
  const earningsBySymbol = new Map<string, Record<string, unknown>>();
  for (const e of events) {
    if (e.event_name.startsWith("Earnings: ")) {
      earningsBySymbol.set(e.event_name.slice("Earnings: ".length), e);
    } else {
      (macroByCountry.get(e.country) ?? macroByCountry.set(e.country, []).get(e.country)!).push(e);
    }
  }

  let actionable = 0;
  let gatedCount = 0;
  let blackoutCount = 0;
  const rows: unknown[][] = [];
  const sample: Array<Record<string, unknown>> = [];

  for (const s of snaps) {
    const factors = computeFactors(s);
    const { composite, coverage } = compose(factors);
    if (coverage < 0.5) continue; // too little data to say anything
    const direction: "bullish" | "bearish" | "neutral" =
      composite > SIGNAL_WEIGHTS.signalAt ? "bullish"
      : composite < -SIGNAL_WEIGHTS.signalAt ? "bearish"
      : "neutral";
    const conviction = Math.round(Math.min(100, Math.abs(composite) * 130 * coverage));
    const regime = s.index_id != null ? regimeByIndex.get(s.index_id) : undefined;
    const { gated, reason } = gateFor(direction, regime);

    const upcoming: Array<Record<string, unknown>> = [];
    const ownEarnings = earningsBySymbol.get(s.symbol);
    if (ownEarnings) upcoming.push(ownEarnings);
    upcoming.push(...(macroByCountry.get(s.country) ?? []));
    const biasedEvents = upcoming.filter((e) => e.expected_bias != null);
    const fundamentalSupport =
        direction !== "neutral" && biasedEvents.some((e) => e.expected_bias === direction);
    const fundamentalConflict =
            direction !== "neutral" &&
            biasedEvents.some((e) => e.expected_bias != null && e.expected_bias !== direction);
    const blackout =
            direction !== "neutral" && upcoming.length > 0 && !fundamentalSupport;

    if (direction !== "neutral") {
      if (gated) gatedCount++;
      else if (blackout) blackoutCount++;
      else actionable++;
    }

    rows.push([
      s.instrument_id, s.index_id, s.week_end, "2-6w", direction, conviction,
      Math.round(composite * 100) / 100,
      JSON.stringify({ factors, coverage, regimeAtCompute: regime ?? null, fundamental: { support: fundamentalSupport, conflict: fundamentalConflict } }),
      gated, reason, blackout, JSON.stringify(upcoming), WEIGHTS_VERSION,
    ]);
    sample.push({
      symbol: s.symbol, index: s.index_symbol, direction, conviction,
      composite: Math.round(composite * 100) / 100, gated, blackout,
    });
  }

  // signals unique key: (instrument_id, as_of_date, weights_version)
  const { upsertRows } = await import("../db");
  const written = await upsertRows(
    "signals",
    ["instrument_id", "index_id", "as_of_date", "horizon", "direction", "conviction",
     "composite_score", "sub_scores", "gated", "gate_reason", "event_blackout",
     "upcoming_events", "weights_version"],
    ["instrument_id", "as_of_date", "weights_version"],
    rows,
  );
  sample.sort((a, b) => (b.conviction as number) - (a.conviction as number));
  return { written, actionable, gated: gatedCount, blackout: blackoutCount, sample };
}
