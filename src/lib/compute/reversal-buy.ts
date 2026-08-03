/**
 * Short-term reversal Buy rule (PRIMARY technical trigger).
 *
 * Combines four independent technical conditions into a single discrete
 * Buy trigger. This is intentionally NOT a blended/averaged score: every
 * condition must confirm on its own, and each condition is reported
 * individually so the confirmation chain stays transparent.
 *
 * Conditions:
 *  1. Net-buyer volume    — volume_confirms is true and volume_vs_20w >= floor
 *  2. RSI rising, in band — rsi_14 > prev rsi_14 and lower <= rsi_14 <= upper
 *  3. Green weekly candle — latest weekly close > open
 *  4. Lower-Bollinger tag — bb_pct_b <= threshold (price at/near lower band)
 *
 * All thresholds are configurable via ReversalBuyThresholds.
 */

export interface ReversalBuyThresholds {
  /** Minimum volume vs 20-week average for the volume condition. */
  volumeFloor: number;
  /** Lower RSI bound (inclusive) — avoids buying oversold-and-still-falling. */
  rsiLower: number;
  /** Upper RSI bound (inclusive) — avoids buying already-overbought names. */
  rsiUpper: number;
  /** Max bb_pct_b for the lower-band condition (0 = on the lower band). */
  bbPctBMax: number;
}

export const DEFAULT_REVERSAL_BUY_THRESHOLDS: ReversalBuyThresholds = {
  volumeFloor: 1.0,
  rsiLower: 40,
  rsiUpper: 68,
  bbPctBMax: 0.15,
};

export interface ReversalBuyInput {
  rsi14: number | null;
  rsi14Prev: number | null;
  bbPctB: number | null;
  volumeVs20w: number | null;
  volumeConfirms: boolean | null;
  weeklyOpen: number | null;
  weeklyClose: number | null;
}

export interface ReversalBuyResult {
  triggered: boolean;
  conditions: {
    netBuyerVolume: boolean;
    rsiRisingInBand: boolean;
    greenWeeklyCandle: boolean;
    lowerBollingerTag: boolean;
  };
  /** Count of confirmed conditions (0-4), for display/sorting. */
  confirmedCount: number;
}

/**
 * Evaluate the short-term reversal Buy rule for a single instrument.
 * Any null / missing input makes the affected condition fail (never throws).
 */
export function evaluateReversalBuy(
  input: ReversalBuyInput,
  thresholds: ReversalBuyThresholds = DEFAULT_REVERSAL_BUY_THRESHOLDS,
): ReversalBuyResult {
  const netBuyerVolume =
    input.volumeConfirms === true &&
    input.volumeVs20w != null &&
    input.volumeVs20w >= thresholds.volumeFloor;

  const rsiRisingInBand =
    input.rsi14 != null &&
    input.rsi14Prev != null &&
    input.rsi14 > input.rsi14Prev &&
    input.rsi14 >= thresholds.rsiLower &&
    input.rsi14 <= thresholds.rsiUpper;

  const greenWeeklyCandle =
    input.weeklyOpen != null &&
    input.weeklyClose != null &&
    input.weeklyClose > input.weeklyOpen;

  const lowerBollingerTag =
    input.bbPctB != null && input.bbPctB <= thresholds.bbPctBMax;

  const conditions = {
    netBuyerVolume,
    rsiRisingInBand,
    greenWeeklyCandle,
    lowerBollingerTag,
  };

  const confirmedCount = Object.values(conditions).filter(Boolean).length;

  return {
    triggered: confirmedCount === 4,
    conditions,
    confirmedCount,
  };
}
