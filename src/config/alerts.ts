/** Alert thresholds — config, not code. */
export const ALERT_CONFIG = {
  /** Fire when a reversal gauge direction is active at ≥ this intensity. */
  gaugeIntensityAt: 25,
  /** Fire on any regime classification change (risk_on/neutral/risk_off). */
  regimeChanges: true,
  /** Fire when an index breadth divergence flag turns on. */
  breadthDivergence: true,
  /** Fire when a watchlist name's verdict becomes overbought-risk or oversold-setup. */
  watchlistVerdicts: true,
} as const;
