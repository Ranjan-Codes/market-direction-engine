import { sma } from "../indicators/moving";
import { rsi } from "../indicators/rsi";
import { macd } from "../indicators/macd";
import { bollinger } from "../indicators/bollinger";

/**
 * Chart overlays computed on the fly for any timeframe, using the same
 * pure indicator functions as the weekly engine — only the parameters
 * change with the frame (daily 150/200-day MAs, weekly 30/40-week,
 * monthly 10/12-month; RSI 14 and MACD 12/26/9 are period-agnostic
 * conventions).
 */

export type Timeframe = "daily" | "weekly" | "monthly";

export const TIMEFRAME_PARAMS: Record<
  Timeframe,
  { maFast: number; maSlow: number; bb: number; maFastLabel: string; maSlowLabel: string; unit: string }
> = {
  daily: { maFast: 150, maSlow: 200, bb: 20, maFastLabel: "150-day avg", maSlowLabel: "200-day avg", unit: "day" },
  weekly: { maFast: 30, maSlow: 40, bb: 20, maFastLabel: "30-week avg", maSlowLabel: "40-week avg", unit: "week" },
  monthly: { maFast: 10, maSlow: 12, bb: 20, maFastLabel: "10-month avg", maSlowLabel: "12-month avg", unit: "month" },
};

export interface ChartBar {
  time: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface OverlayPoint {
  time: string;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  bbUpper: number | null;
  bbMid: number | null;
  bbLower: number | null;
  maFast: number | null;
  maSlow: number | null;
}

export function computeOverlays(bars: ChartBar[], tf: Timeframe): OverlayPoint[] {
  const p = TIMEFRAME_PARAMS[tf];
  const closes = bars.map((b) => b.close);
  const rsiS = rsi(closes, 14);
  const macdS = macd(closes, 12, 26, 9);
  const bb = bollinger(closes, p.bb, 2, 26, 2);
  const fast = sma(closes, p.maFast);
  const slow = sma(closes, p.maSlow);
  return bars.map((b, i) => ({
    time: b.time,
    rsi: rsiS[i],
    macd: macdS[i].macd,
    macdSignal: macdS[i].signal,
    macdHist: macdS[i].histogram,
    bbUpper: bb[i].upper,
    bbMid: bb[i].mid,
    bbLower: bb[i].lower,
    maFast: fast[i],
    maSlow: slow[i],
  }));
}

/** Aggregate weekly bars into calendar months (first open, max high, min low, last close, summed volume). */
export function aggregateMonthly(weekly: ChartBar[]): ChartBar[] {
  const byMonth = new Map<string, ChartBar[]>();
  for (const b of weekly) {
    const key = b.time.slice(0, 7);
    (byMonth.get(key) ?? byMonth.set(key, []).get(key)!).push(b);
  }
  const out: ChartBar[] = [];
  for (const [month, bars] of [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const highs = bars.map((b) => b.high).filter((v): v is number => v != null);
    const lows = bars.map((b) => b.low).filter((v): v is number => v != null);
    const vols = bars.map((b) => b.volume).filter((v): v is number => v != null);
    out.push({
      time: `${month}-01`,
      open: bars[0].open,
      high: highs.length ? Math.max(...highs) : null,
      low: lows.length ? Math.min(...lows) : null,
      close: bars[bars.length - 1].close,
      volume: vols.length ? vols.reduce((a, b) => a + b, 0) : null,
    });
  }
  return out;
}
