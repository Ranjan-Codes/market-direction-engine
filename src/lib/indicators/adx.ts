/**
 * ATR and ADX/DMI (Wilder, 14 default), classic Wilder smoothing:
 * seed = simple average of first `period` values, then
 * smoothed = (prev * (period-1) + value) / period.
 *
 * Bars with null O/H/L/C are skipped (the previous valid bar remains the
 * reference for true range).
 */

export interface HlcBar {
  high: number | null;
  low: number | null;
  close: number | null;
}

export interface AdxPoint {
  atr: number | null;
  adx: number | null;
  diPlus: number | null;
  diMinus: number | null;
}

export function adxAtr(bars: HlcBar[], period: number): AdxPoint[] {
  const out: AdxPoint[] = bars.map(() => ({
    atr: null, adx: null, diPlus: null, diMinus: null,
  }));

  let prev: { high: number; low: number; close: number } | null = null;
  let atr: number | null = null;
  let smPlus: number | null = null; // smoothed +DM
  let smMinus: number | null = null;
  let adx: number | null = null;
  let seedTr = 0;
  let seedPlus = 0;
  let seedMinus = 0;
  let seedCount = 0;
  let dxSum = 0;
  let dxCount = 0;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (b.high == null || b.low == null || b.close == null) continue;
    const cur = { high: b.high, low: b.low, close: b.close };
    if (prev == null) {
      prev = cur;
      continue;
    }
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;
    prev = cur;

    if (atr == null) {
      seedTr += tr;
      seedPlus += plusDm;
      seedMinus += minusDm;
      seedCount++;
      if (seedCount === period) {
        atr = seedTr / period;
        smPlus = seedPlus / period;
        smMinus = seedMinus / period;
      } else {
        continue;
      }
    } else {
      atr = (atr * (period - 1) + tr) / period;
      smPlus = (smPlus! * (period - 1) + plusDm) / period;
      smMinus = (smMinus! * (period - 1) + minusDm) / period;
    }

    const diPlus = atr > 0 ? (100 * smPlus!) / atr : 0;
    const diMinus = atr > 0 ? (100 * smMinus!) / atr : 0;
    const diSum = diPlus + diMinus;
    const dx = diSum > 0 ? (100 * Math.abs(diPlus - diMinus)) / diSum : 0;

    if (adx == null) {
      dxSum += dx;
      dxCount++;
      if (dxCount === period) adx = dxSum / period;
    } else {
      adx = (adx * (period - 1) + dx) / period;
    }

    out[i] = { atr, adx, diPlus, diMinus };
  }
  return out;
}
