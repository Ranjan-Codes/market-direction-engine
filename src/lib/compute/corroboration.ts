/**
 * Per-stock corroboration helper (north-star, layers 2 & 3).
 *
 * The app's reversal signal is TECHNICAL-first. Social chatter and
 * fundamental expectations are independent corroboration layers, never
 * blended into the technical score. Each layer resolves to one of three
 * honest states relative to the technical direction:
 *   - "confirms"     the layer agrees with the technical direction
 *   - "contradicts"  the layer points the opposite way
 *   - "silent"       no data, or the read is inside the noise deadband
 *
 * Keeping these as discrete states (not a weighted average) preserves the
 * technical -> social -> fundamental confirmation chain.
 */

export type Direction = "bullish" | "bearish" | null;
export type Bias = "bullish" | "bearish" | null;
export type Corroboration = "confirms" | "contradicts" | "silent";

/** Scores within +/- this band are treated as noise, i.e. "silent". */
export const SOCIAL_DEADBAND = 0.15;

/**
 * Compare a normalised sentiment score (-1..+1) against the technical
 * direction. Null/near-zero scores are "silent" rather than neutral-forced.
 */
export function corroborateScore(
  direction: Direction,
  score: number | null | undefined,
  deadband: number = SOCIAL_DEADBAND,
): Corroboration {
  if (direction == null || score == null || Number.isNaN(score)) return "silent";
  if (Math.abs(score) <= deadband) return "silent";
  const scoreDir: Direction = score > 0 ? "bullish" : "bearish";
  return scoreDir === direction ? "confirms" : "contradicts";
}

/**
 * Compare a discrete fundamental bias (bullish/bearish/null) against the
 * technical direction. Used for expected_bias and analyst-derived reads.
 */
export function corroborateBias(direction: Direction, bias: Bias): Corroboration {
  if (direction == null || bias == null) return "silent";
  return bias === direction ? "confirms" : "contradicts";
}

/** Human-facing label for a corroboration state. */
export function corroborationLabel(state: Corroboration): string {
  switch (state) {
    case "confirms":
      return "Confirms";
    case "contradicts":
      return "Contradicts";
    default:
      return "Silent";
  }
}

