/**
 * Moving averages and slopes. All functions return arrays aligned with the
 * input (index i = value at bar i), null until enough history exists —
 * alignment is the core look-ahead guard: value[i] uses bars ≤ i only.
 */

export function sma(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  const window: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    window.push(v);
    if (v != null) {
      sum += v;
      count++;
    }
    if (window.length > period) {
      const dropped = window.shift();
      if (dropped != null) {
        sum -= dropped;
        count--;
      }
    }
    if (window.length === period && count === period) out[i] = sum / period;
  }
  return out;
}

export function ema(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      out[i] = prev; // carry forward; gaps don't reset the EMA
      continue;
    }
    if (prev == null) {
      // Seed with SMA of the first `period` values (standard convention).
      seedSum += v;
      seedCount++;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** % change of a series over `weeks` bars: (v[i] / v[i-weeks]) - 1. */
export function slope(
  values: (number | null)[],
  weeks: number,
): (number | null)[] {
  return values.map((v, i) => {
    const past = i >= weeks ? values[i - weeks] : null;
    return v != null && past != null && past !== 0 ? v / past - 1 : null;
  });
}

export type CrossEvent = "golden" | "death" | null;

/** Cross of fast MA over slow MA at bar i (event fires only on the cross week). */
export function crosses(
  fast: (number | null)[],
  slow: (number | null)[],
): CrossEvent[] {
  return fast.map((f, i) => {
    if (i === 0) return null;
    const pf = fast[i - 1];
    const ps = slow[i - 1];
    const s = slow[i];
    if (f == null || s == null || pf == null || ps == null) return null;
    if (pf <= ps && f > s) return "golden";
    if (pf >= ps && f < s) return "death";
    return null;
  });
}
