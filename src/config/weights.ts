/**
 * Regime + gauge weights, version 'v1'. Stored into weights_versions on
 * first compute so every regime_scores/signals row is traceable to the
 * exact weights that produced it. Change = new version string, never edit
 * v1 in place after it has produced rows.
 */
export const WEIGHTS_VERSION = "v1";

export const REGIME_WEIGHTS = {
  /** Sub-score weights (renormalised over non-null sub-scores; narrative is
   *  the noisiest input and deliberately capped — Phase 5 reports whether
   *  it earns a bigger seat). */
  subScores: {
    trend: 0.25,
    breadth: 0.3,
    intermarket: 0.2,
    positioning: 0.1,
    narrative: 0.15,
  },
  /** Composite (0-100) → regime classification. */
  thresholds: { riskOn: 60, riskOff: 40 },
} as const;

/**
 * Reversal-risk gauge (north-star): evidence items and weights. Intensity =
 * 100 × Σ(present weights) / Σ(all weights); direction fires at ≥25.
 */
export const GAUGE_WEIGHTS = {
  overbought: {
    rsiHot: 2, //  weekly RSI > 70 (3 if > 75)
    rsiExtreme: 1, // extra point on top of rsiHot when > 75
    priceStretched: 2, // 52w-range pos > 0.9 AND %B > 0.95
    bearishDivergence: 3, // weekly RSI divergence on the index
    breadthDivergence: 3, // index highs on deteriorating internals
    mcclellanCross: 2, // McClellan osc < 0 while index near high
    positioningExtreme: 2, // COT net z > +1.5 (crowded long)
    narrativeEuphoria: 1, // market tone z > +1
    vixComplacency: 1, // VIX below its 10th percentile (2y)
    internalsLagging: 2, // % members above 30w MA falling while index rises
  },
  oversold: {
    rsiCold: 2, // weekly RSI < 30 (3 if < 25)
    rsiExtreme: 1,
    priceWashedOut: 2, // 52w-range pos < 0.1 AND %B < 0.05
    bullishDivergence: 3,
    breadthWashout: 3, // % above 50d < 15
    mcclellanTurn: 2, // McClellan osc crossing up from < -50
    positioningExtreme: 2, // COT net z < -1.5 (crowded short)
    narrativeDespair: 1, // market tone z < -1
    vixPanic: 1, // VIX above its 90th percentile (2y)
    internalsFirming: 2, // % members above 30w MA rising while index falls
  },
  fireAt: 25,
} as const;
