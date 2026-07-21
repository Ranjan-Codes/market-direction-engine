import { sma } from "./moving";

export interface OhlcvBar {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

/** On-Balance Volume: cumulative volume signed by the close-over-close move. */
export function obv(bars: OhlcvBar[]): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let running = 0;
  let prevClose: number | null = null;
  let started = false;
  for (let i = 0; i < bars.length; i++) {
    const { close, volume } = bars[i];
    if (close == null) continue;
    if (prevClose != null && volume != null) {
      if (close > prevClose) running += volume;
      else if (close < prevClose) running -= volume;
      started = true;
    }
    prevClose = close;
    if (started) out[i] = running;
  }
  return out;
}

/** Accumulation/Distribution line: cumulative money-flow volume. */
export function adLine(bars: OhlcvBar[]): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let running = 0;
  let started = false;
  for (let i = 0; i < bars.length; i++) {
    const { high, low, close, volume } = bars[i];
    if (high == null || low == null || close == null || volume == null) {
      if (started) out[i] = running;
      continue;
    }
    const range = high - low;
    const mfm = range > 0 ? ((close - low) - (high - close)) / range : 0;
    running += mfm * volume;
    started = true;
    out[i] = running;
  }
  return out;
}

export interface VolumeRead {
  /** volume this bar ÷ N-week average volume. */
  ratio: number | null;
  /** direction of the close move is backed by above-average volume. */
  confirms: boolean | null;
}

export function volumeVsAverage(
  bars: OhlcvBar[],
  averageWeeks: number,
): VolumeRead[] {
  const vols = bars.map((b) => b.volume);
  const avg = sma(vols, averageWeeks);
  return bars.map((b, i) => {
    const a = avg[i];
    if (b.volume == null || a == null || a === 0) {
      return { ratio: null, confirms: null };
    }
    const ratio = b.volume / a;
    const prevClose = i > 0 ? bars[i - 1].close : null;
    const confirms =
      b.close != null && prevClose != null && b.close !== prevClose
        ? ratio >= 1
        : null;
    return { ratio, confirms };
  });
}
