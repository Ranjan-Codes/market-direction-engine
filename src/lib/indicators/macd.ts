import { ema } from "./moving";

export interface MacdPoint {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

/** MACD (12/26/9 default): EMA(fast) - EMA(slow), signal = EMA(9) of MACD. */
export function macd(
  closes: (number | null)[],
  fast: number,
  slow: number,
  signalPeriod: number,
): MacdPoint[] {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i]! - emaSlow[i]! : null,
  );
  const signalLine = ema(macdLine, signalPeriod);
  return closes.map((_, i) => ({
    macd: macdLine[i],
    signal: signalLine[i],
    histogram:
      macdLine[i] != null && signalLine[i] != null
        ? macdLine[i]! - signalLine[i]!
        : null,
  }));
}
