/**
 * RSI (Wilder, 14 default): Wilder smoothing (a.k.a. RMA), seeded with the
 * simple average of the first `period` gains/losses. Output aligned to
 * input; null until period+1 bars exist.
 */
export function rsi(closes: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let avgGain: number | null = null;
  let avgLoss: number | null = null;
  let seedGain = 0;
  let seedLoss = 0;
  let seedCount = 0;
  let prevClose: number | null = null;

  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    if (prevClose == null) {
      prevClose = c;
      continue;
    }
    const change = c - prevClose;
    prevClose = c;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    if (avgGain == null || avgLoss == null) {
      seedGain += gain;
      seedLoss += loss;
      seedCount++;
      if (seedCount === period) {
        avgGain = seedGain / period;
        avgLoss = seedLoss / period;
        out[i] = toRsi(avgGain, avgLoss);
      }
      continue;
    }
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = toRsi(avgGain, avgLoss);
  }
  return out;
}

function toRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}
