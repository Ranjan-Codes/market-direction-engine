import { sma } from "./moving";

export interface BollingerPoint {
  upper: number | null;
  mid: number | null;
  lower: number | null;
  /** %B: 0 at lower band, 1 at upper band. */
  pctB: number | null;
  /** (upper - lower) / mid — normalised band width. */
  bandwidth: number | null;
  /** Bandwidth at its narrowest of `squeezeLookback` weeks. */
  squeeze: boolean;
  /** `bandWalkWeeks`+ consecutive closes beyond a band. */
  bandWalk: "upper" | "lower" | null;
}

export function bollinger(
  closes: (number | null)[],
  period: number,
  stdDev: number,
  squeezeLookback: number,
  bandWalkWeeks: number,
): BollingerPoint[] {
  const mid = sma(closes, period);
  const out: BollingerPoint[] = [];
  const bandwidths: (number | null)[] = [];
  let aboveRun = 0;
  let belowRun = 0;

  for (let i = 0; i < closes.length; i++) {
    const m = mid[i];
    const c = closes[i];
    const point: BollingerPoint = {
      upper: null, mid: m, lower: null, pctB: null,
      bandwidth: null, squeeze: false, bandWalk: null,
    };
    if (m != null) {
      // population std-dev over the same window as the SMA (convention)
      let sumSq = 0;
      let n = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const v = closes[j];
        if (v != null) {
          sumSq += (v - m) ** 2;
          n++;
        }
      }
      if (n === period) {
        const sd = Math.sqrt(sumSq / period);
        const upper = m + stdDev * sd;
        const lower = m - stdDev * sd;
        const width = upper - lower;
        point.upper = upper;
        point.lower = lower;
        point.pctB = c != null && width > 0 ? (c - lower) / width : null;
        point.bandwidth = m !== 0 ? width / m : null;

        if (c != null) {
          aboveRun = c > upper ? aboveRun + 1 : 0;
          belowRun = c < lower ? belowRun + 1 : 0;
          if (aboveRun >= bandWalkWeeks) point.bandWalk = "upper";
          else if (belowRun >= bandWalkWeeks) point.bandWalk = "lower";
        }
      }
    }
    bandwidths.push(point.bandwidth);
    if (point.bandwidth != null) {
      const window = bandwidths
        .slice(Math.max(0, i - squeezeLookback + 1), i + 1)
        .filter((b): b is number => b != null);
      point.squeeze =
        window.length >= squeezeLookback && point.bandwidth <= Math.min(...window);
    }
    out.push(point);
  }
  return out;
}
