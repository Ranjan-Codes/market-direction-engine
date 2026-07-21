import { describe, expect, it } from "vitest";
import { RSI, MACD, SMA, EMA, BollingerBands, ADX, ATR } from "technicalindicators";
import { sma, ema, slope, crosses } from "./moving";
import { rsi } from "./rsi";
import { macd } from "./macd";
import { bollinger } from "./bollinger";
import { adxAtr } from "./adx";
import { obv, adLine, volumeVsAverage } from "./volume";
import { mansfieldRs } from "./mansfield";
import { rangePosition } from "./range";
import { rsiDivergence } from "./divergence";

/** Deterministic pseudo-random walk (no Math.random — reproducible refs). */
function randomWalk(n: number, seed = 42): number[] {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
  const out: number[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price = Math.max(1, price * (1 + (next() - 0.5) * 0.06));
    out.push(Number(price.toFixed(4)));
  }
  return out;
}

const WALK = randomWalk(300);
const last = <T>(arr: T[], n: number) => arr.slice(-n);

describe("sma/ema vs reference library", () => {
  it("sma matches", () => {
    const ours = sma(WALK, 20).filter((v): v is number => v != null);
    const ref = SMA.calculate({ period: 20, values: WALK });
    expect(ours.length).toBe(ref.length);
    last(ours, 50).forEach((v, i) =>
      expect(v).toBeCloseTo(last(ref, 50)[i], 6),
    );
  });
  it("ema matches", () => {
    const ours = ema(WALK, 20).filter((v): v is number => v != null);
    const ref = EMA.calculate({ period: 20, values: WALK });
    last(ours, 50).forEach((v, i) =>
      expect(v).toBeCloseTo(last(ref, 50)[i], 6),
    );
  });
});

describe("rsi (Wilder) vs reference library", () => {
  it("matches on a 300-bar walk", () => {
    const ours = rsi(WALK, 14).filter((v): v is number => v != null);
    const ref = RSI.calculate({ period: 14, values: WALK });
    expect(ours.length).toBe(ref.length);
    last(ours, 50).forEach((v, i) =>
      expect(v).toBeCloseTo(last(ref, 50)[i], 2),
    );
  });
  it("is 100 for a monotonic rise and stays within [0,100]", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const r = rsi(up, 14);
    expect(r[29]).toBe(100);
    rsi(WALK, 14).forEach((v) => {
      if (v != null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });
  });
});

describe("macd vs reference library", () => {
  it("matches macd/signal/histogram", () => {
    const ours = macd(WALK, 12, 26, 9).filter((p) => p.signal != null);
    const ref = MACD.calculate({
      values: WALK, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
      SimpleMAOscillator: false, SimpleMASignal: false,
    }).filter((p) => p.signal !== undefined);
    last(ours, 30).forEach((p, i) => {
      const r = last(ref, 30)[i];
      expect(p.macd!).toBeCloseTo(r.MACD!, 4);
      expect(p.signal!).toBeCloseTo(r.signal!, 4);
      expect(p.histogram!).toBeCloseTo(r.histogram!, 4);
    });
  });
});

describe("bollinger vs reference library", () => {
  it("matches upper/mid/lower and %B", () => {
    const ours = bollinger(WALK, 20, 2, 26, 2).filter((p) => p.upper != null);
    const ref = BollingerBands.calculate({ period: 20, stdDev: 2, values: WALK });
    expect(ours.length).toBe(ref.length);
    last(ours, 30).forEach((p, i) => {
      const r = last(ref, 30)[i];
      expect(p.mid!).toBeCloseTo(r.middle, 4);
      expect(p.upper!).toBeCloseTo(r.upper, 4);
      expect(p.lower!).toBeCloseTo(r.lower, 4);
      expect(p.pctB!).toBeCloseTo(r.pb!, 4);
    });
  });
  it("squeezes after volatility collapses, never right after it expands", () => {
    // 40 flat bars → 30 volatile bars → 40 flat bars
    const flat = (n: number, base: number) =>
      Array.from({ length: n }, (_, i) => base + (i % 2) * 0.01);
    const series = [...flat(40, 100), ...randomWalk(30, 7), ...flat(40, 150)];
    const b = bollinger(series, 20, 2, 26, 2);
    // end of the final flat stretch: bandwidth at its 26w low → squeeze
    expect(b[series.length - 1].squeeze).toBe(true);
    // just after the volatility expansion (bars 60-69): bandwidth near its
    // window HIGH → no squeeze possible
    expect(b.slice(60, 70).some((p) => p.squeeze)).toBe(false);
  });
});

describe("adx/atr (Wilder) vs reference library", () => {
  const bars = WALK.map((c, i) => ({
    high: c * 1.02 + (i % 3) * 0.1,
    low: c * 0.98,
    close: c,
  }));
  const input = {
    high: bars.map((b) => b.high),
    low: bars.map((b) => b.low),
    close: bars.map((b) => b.close),
    period: 14,
  };
  it("atr matches", () => {
    const ours = adxAtr(bars, 14).map((p) => p.atr).filter((v): v is number => v != null);
    const ref = ATR.calculate(input);
    last(ours, 30).forEach((v, i) => expect(v).toBeCloseTo(last(ref, 30)[i], 4));
  });
  it("adx and di match", () => {
    const ours = adxAtr(bars, 14).filter((p) => p.adx != null);
    const ref = ADX.calculate(input);
    expect(ours.length).toBe(ref.length);
    last(ours, 30).forEach((p, i) => {
      const r = last(ref, 30)[i];
      expect(p.adx!).toBeCloseTo(r.adx, 2);
      expect(p.diPlus!).toBeCloseTo(r.pdi, 2);
      expect(p.diMinus!).toBeCloseTo(r.mdi, 2);
    });
  });
});

describe("obv / adLine / volume ratio (hand-verified)", () => {
  const bars = [
    { open: 10, high: 11, low: 9, close: 10, volume: 100 },
    { open: 10, high: 12, low: 10, close: 11, volume: 200 }, // up → +200
    { open: 11, high: 12, low: 10, close: 10.5, volume: 150 }, // down → -150
    { open: 10.5, high: 11, low: 10, close: 10.5, volume: 80 }, // flat → 0
  ];
  it("obv accumulates signed volume", () => {
    expect(obv(bars)).toEqual([null, 200, 50, 50]);
  });
  it("adLine uses money-flow multiplier", () => {
    // bar0: mfm = ((10-9)-(11-10))/2 = 0 → 0
    // bar1: mfm = ((11-10)-(12-11))/2 = 0 → 0
    // bar2: mfm = ((10.5-10)-(12-10.5))/2 = -0.5 → -75
    const ad = adLine(bars);
    expect(ad[0]).toBe(0);
    expect(ad[2]).toBeCloseTo(-75);
  });
  it("volume ratio and confirmation", () => {
    const reads = volumeVsAverage(bars, 2);
    // bar2: avg(200,150)=175 ratio≈0.857, close moved down on sub-avg volume → not confirmed
    expect(reads[2].ratio).toBeCloseTo(150 / 175);
    expect(reads[2].confirms).toBe(false);
  });
});

describe("mansfield rs (hand-verified)", () => {
  it("is 0 when stock tracks index exactly, positive when outperforming", () => {
    const idx = Array.from({ length: 60 }, (_, i) => 100 + i);
    const same = mansfieldRs(idx, idx, 52, 4);
    expect(same[59].rs).toBeCloseTo(0);
    // Persistent outperformer: stock compounds 1% per week over the index
    const stock = idx.map((v, i) => v * 1.01 ** i);
    const m = mansfieldRs(stock, idx, 52, 4);
    expect(m[59].rs!).toBeGreaterThan(0);
    expect(m[59].trend).toBe("leading");
  });
});

describe("rangePosition (hand-verified)", () => {
  it("puts close at the top of its 52w range = 1", () => {
    const bars = Array.from({ length: 52 }, (_, i) => ({
      high: 100 + i, low: 90 + i, close: 100 + i,
    }));
    const r = rangePosition(bars, 52, 13);
    expect(r[51].pos52w).toBeCloseTo(1);
    // resistance = max high of previous 13 bars (excl. current)
    expect(r[51].resistance).toBe(150);
    expect(r[51].support).toBe(128);
  });
});

describe("slope & crosses (hand-verified)", () => {
  it("slope is % change over window", () => {
    const s = slope([100, 110, 121, 133.1], 2);
    expect(s[2]).toBeCloseTo(0.21);
  });
  it("detects golden and death crosses only on the cross bar", () => {
    const fast = [1, 2, 3, 4, 3, 2, 1];
    const slow = [2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5];
    const c = crosses(fast, slow);
    expect(c).toEqual([null, null, "golden", null, null, "death", null]);
  });
});

describe("rsiDivergence (constructed cases)", () => {
  it("flags bearish divergence: higher price high, lower osc high", () => {
    // price pivots: bar4 (110) and bar10 (115); osc pivots: 80 then 65
    const price = [100, 105, 108, 109, 110, 106, 104, 108, 112, 114, 115, 110, 108];
    const osc =   [50,  60,  70,  75,  80,  70,  60,  62,  63,  64,  65,  55,  50];
    const d = rsiDivergence(price, osc, 2, 26);
    expect(d[12]).toBe("bearish"); // pivot at bar 10 confirms at bar 12
  });
  it("flags bullish divergence: lower price low, higher osc low", () => {
    const price = [100, 95, 92, 91, 90, 94, 96, 92, 89, 88, 87, 92, 94];
    const osc =   [50,  40, 32, 31, 30, 40, 45, 42, 40, 39, 38, 45, 50];
    const d = rsiDivergence(price, osc, 2, 26);
    expect(d[12]).toBe("bullish");
  });
  it("stays quiet without divergence", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsiDivergence(up, up, 2, 26).every((v) => v == null)).toBe(true);
  });
});
