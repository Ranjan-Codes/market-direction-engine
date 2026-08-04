import { describe, expect, it } from "vitest";

import {
  DEFAULT_REVERSAL_BUY_THRESHOLDS,
  evaluateReversalBuy,
  type ReversalBuyInput,
} from "./reversal-buy";

// A base input that satisfies all four conditions.
const passing: ReversalBuyInput = {
  rsi14: 55,
  rsi14Prev: 48,
  bbPctB: 0.08,
  volumeVs20w: 1.4,
  volumeConfirms: true,
  weeklyOpen: 10,
  weeklyClose: 11,
};

describe("evaluateReversalBuy", () => {
  it("triggers when all four conditions confirm", () => {
    const r = evaluateReversalBuy(passing);
    expect(r.triggered).toBe(true);
    expect(r.confirmedCount).toBe(4);
    expect(r.conditions.netBuyerVolume).toBe(true);
    expect(r.conditions.rsiRisingInBand).toBe(true);
    expect(r.conditions.greenWeeklyCandle).toBe(true);
    expect(r.conditions.lowerBollingerTag).toBe(true);
  });

  it("does not trigger without net-buyer volume", () => {
    const r = evaluateReversalBuy({ ...passing, volumeConfirms: false });
    expect(r.triggered).toBe(false);
    expect(r.conditions.netBuyerVolume).toBe(false);
    expect(r.confirmedCount).toBe(3);
  });

  it("does not trigger when volume is below the floor", () => {
    const r = evaluateReversalBuy({ ...passing, volumeVs20w: 0.8 });
    expect(r.conditions.netBuyerVolume).toBe(false);
    expect(r.triggered).toBe(false);
  });

  it("does not trigger when RSI is falling", () => {
    const r = evaluateReversalBuy({ ...passing, rsi14: 45, rsi14Prev: 50 });
    expect(r.conditions.rsiRisingInBand).toBe(false);
    expect(r.triggered).toBe(false);
  });

  it("does not trigger when RSI is already overbought (70 > upper bound)", () => {
    const r = evaluateReversalBuy({ ...passing, rsi14: 70, rsi14Prev: 65 });
    expect(r.conditions.rsiRisingInBand).toBe(false);
    expect(r.triggered).toBe(false);
  });

  it("does not trigger on a red weekly candle", () => {
    const r = evaluateReversalBuy({ ...passing, weeklyClose: 9 });
    expect(r.conditions.greenWeeklyCandle).toBe(false);
    expect(r.triggered).toBe(false);
  });

  it("does not trigger when price is not near the lower band", () => {
    const r = evaluateReversalBuy({ ...passing, bbPctB: 0.5 });
    expect(r.conditions.lowerBollingerTag).toBe(false);
    expect(r.triggered).toBe(false);
  });

  it("treats null inputs as failing conditions and never throws", () => {
    const r = evaluateReversalBuy({
      rsi14: null,
      rsi14Prev: null,
      bbPctB: null,
      volumeVs20w: null,
      volumeConfirms: null,
      weeklyOpen: null,
      weeklyClose: null,
    });
    expect(r.triggered).toBe(false);
    expect(r.confirmedCount).toBe(0);
  });

  it("respects custom thresholds", () => {
    const strict = { ...DEFAULT_REVERSAL_BUY_THRESHOLDS, rsiUpper: 50 };
    const r = evaluateReversalBuy({ ...passing, rsi14: 55, rsi14Prev: 48 }, strict);
    expect(r.conditions.rsiRisingInBand).toBe(false);
    expect(r.triggered).toBe(false);
  });
});
