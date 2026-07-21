export interface RangeBar {
  high: number | null;
  low: number | null;
  close: number | null;
}

export interface RangePoint {
  /** Position in the trailing 52-week range: 0 = at low, 1 = at high. */
  pos52w: number | null;
  /** Rolling swing extremes over the S/R window (excludes current bar). */
  support: number | null;
  resistance: number | null;
}

export function rangePosition(
  bars: RangeBar[],
  weeks52: number,
  srWeeks: number,
): RangePoint[] {
  return bars.map((b, i) => {
    const out: RangePoint = { pos52w: null, support: null, resistance: null };

    if (b.close != null && i + 1 >= weeks52) {
      let hi = -Infinity;
      let lo = Infinity;
      for (let j = i - weeks52 + 1; j <= i; j++) {
        const bj = bars[j];
        if (bj.high != null) hi = Math.max(hi, bj.high);
        if (bj.low != null) lo = Math.min(lo, bj.low);
      }
      if (isFinite(hi) && isFinite(lo) && hi > lo) {
        out.pos52w = (b.close - lo) / (hi - lo);
      }
    }

    if (i >= srWeeks) {
      let hi = -Infinity;
      let lo = Infinity;
      for (let j = i - srWeeks; j < i; j++) {
        const bj = bars[j];
        if (bj.high != null) hi = Math.max(hi, bj.high);
        if (bj.low != null) lo = Math.min(lo, bj.low);
      }
      if (isFinite(hi)) out.resistance = hi;
      if (isFinite(lo)) out.support = lo;
    }
    return out;
  });
}
