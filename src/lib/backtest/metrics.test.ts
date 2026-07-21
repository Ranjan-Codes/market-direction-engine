import { describe, expect, it } from "vitest";
import {
  hitRate, avgReturn, expectancy, profitFactor, maxDrawdown, periodAverages,
  type SignalOutcome,
} from "./metrics";

const long = (r: number): SignalOutcome => ({ side: 1, fwdReturn: r });
const short = (r: number): SignalOutcome => ({ side: -1, fwdReturn: r });

describe("metrics", () => {
  it("hitRate counts directional wins (shorts win on falls)", () => {
    expect(hitRate([long(0.05), long(-0.02), short(-0.03), short(0.01)])).toBe(0.5);
    expect(hitRate([])).toBeNull();
  });

  it("avgReturn is signed by side", () => {
    expect(avgReturn([long(0.1), short(-0.1)])).toBeCloseTo(0.1);
  });

  it("expectancy = pWin*avgWin + pLoss*avgLoss", () => {
    // wins: +10%, +6% (p=0.5, avg 0.08); losses: -4%, -2% (avg -0.03)
    const e = expectancy([long(0.1), long(0.06), long(-0.04), long(-0.02)]);
    expect(e).toBeCloseTo(0.5 * 0.08 + 0.5 * -0.03);
  });

  it("profitFactor = gross wins over gross losses", () => {
    expect(profitFactor([long(0.1), long(0.05), long(-0.05)])).toBeCloseTo(3);
    expect(profitFactor([long(0.1)])).toBe(Infinity);
  });

  it("maxDrawdown finds the deepest peak-to-trough", () => {
    // 1 → 1.1 → 0.88 → 0.968: peak 1.1, trough 0.88 → dd = 20%
    expect(maxDrawdown([0.1, -0.2, 0.1])).toBeCloseTo(0.2);
    expect(maxDrawdown([0.05, 0.05])).toBe(0);
  });

  it("periodAverages groups by date chronologically", () => {
    const rs = periodAverages([
      { date: "2025-02-07", outcome: long(0.04) },
      { date: "2025-01-03", outcome: long(0.02) },
      { date: "2025-01-03", outcome: short(0.02) }, // pnl -0.02 → avg 0
    ]);
    expect(rs).toEqual([0, 0.04]);
  });
});
