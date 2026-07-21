/**
 * RSI divergence via pivot comparison. A pivot high at bar i means the value
 * is the maximum of the window [i-width, i+width] (analogous for lows).
 * Pivots confirm only `width` bars after they form — the output at bar i
 * uses information available at bar i (no look-ahead: a divergence is
 * reported from the bar where the second pivot is confirmed).
 *
 * Bearish: price makes a higher pivot high while RSI makes a lower pivot high.
 * Bullish: price makes a lower pivot low while RSI makes a higher pivot low.
 */

export type Divergence = "bullish" | "bearish" | null;

interface Pivot {
  index: number;
  price: number;
  osc: number;
}

export function rsiDivergence(
  prices: (number | null)[],
  oscillator: (number | null)[],
  pivotWidth: number,
  lookbackWeeks: number,
): Divergence[] {
  const out: Divergence[] = new Array(prices.length).fill(null);
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];

  const isPivot = (
    arr: (number | null)[],
    i: number,
    cmp: (a: number, b: number) => boolean,
  ): boolean => {
    const v = arr[i];
    if (v == null) return false;
    for (let j = i - pivotWidth; j <= i + pivotWidth; j++) {
      if (j === i || j < 0 || j >= arr.length) continue;
      const w = arr[j];
      if (w != null && cmp(w, v)) return false;
    }
    return true;
  };

  for (let i = 0; i < prices.length; i++) {
    // A pivot at (i - pivotWidth) is confirmed at bar i.
    const p = i - pivotWidth;
    if (p < pivotWidth) continue;
    const price = prices[p];
    const osc = oscillator[p];
    if (price == null || osc == null) continue;

    if (isPivot(prices, p, (a, b) => a > b)) {
      const prevHigh = highs.length ? highs[highs.length - 1] : null;
      highs.push({ index: p, price, osc });
      if (
        prevHigh &&
        p - prevHigh.index <= lookbackWeeks &&
        price > prevHigh.price &&
        osc < prevHigh.osc
      ) {
        out[i] = "bearish";
      }
    }
    if (isPivot(prices, p, (a, b) => a < b)) {
      const prevLow = lows.length ? lows[lows.length - 1] : null;
      lows.push({ index: p, price, osc });
      if (
        prevLow &&
        p - prevLow.index <= lookbackWeeks &&
        price < prevLow.price &&
        osc > prevLow.osc
      ) {
        // bearish already set from a simultaneous high pivot is unlikely;
        // bullish takes precedence only if not already flagged
        out[i] = out[i] ?? "bullish";
      }
    }
  }
  return out;
}
