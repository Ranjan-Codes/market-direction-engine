/**
 * Layer-2 indicator parameters — config, not code (guardrail: no magic
 * numbers). All periods are in WEEKS (weekly bars are the primary frame).
 */
export const INDICATOR_PARAMS = {
  rsi: { period: 14 },
  bollinger: {
    period: 20,
    stdDev: 2,
    /** squeeze = bandwidth at its lowest of this many weeks */
    squeezeLookback: 26,
    /** band walk = this many consecutive closes beyond a band */
    bandWalkWeeks: 2,
  },
  macd: { fast: 12, slow: 26, signal: 9 },
  adx: { period: 14 },
  atr: { period: 14 },
  movingAverages: {
    fast: 30, // 30-week ≈ institutional 150-day
    slow: 40, // 40-week ≈ institutional 200-day
    /** slope measured as % change of the MA over this many weeks */
    slopeWeeks: 5,
  },
  volume: { averageWeeks: 20 },
  mansfield: {
    /** RS line smoothed over this many weeks (Mansfield's 52-week zero line) */
    period: 52,
    /** trend read compares Mansfield RS now vs this many weeks ago */
    trendWeeks: 4,
  },
  range: {
    weeks52: 52,
    /** support/resistance = rolling extremes over this window */
    srWeeks: 13,
  },
  divergence: {
    /** pivot = local extreme vs this many weeks each side */
    pivotWidth: 2,
    /** compare the two most recent pivots within this lookback */
    lookbackWeeks: 26,
  },
  /** snapshots stored for this many recent weeks (backtests recompute
   *  from ohlcv_weekly on the fly — keeps the free tier inside 500 MB) */
  snapshotRetentionWeeks: 260,
} as const;
