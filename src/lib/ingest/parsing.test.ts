import { describe, expect, it } from "vitest";
import { parseCalendarValue } from "../providers/forexfactory";
import { toYahooSymbol } from "../constituents/wikipedia";

describe("parseCalendarValue", () => {
  it("parses percentages", () => {
    expect(parseCalendarValue("3.4%")).toEqual({ value: 3.4, unit: "%" });
    expect(parseCalendarValue("-0.2%")).toEqual({ value: -0.2, unit: "%" });
  });
  it("parses magnitude suffixes", () => {
    expect(parseCalendarValue("250M")).toEqual({ value: 250, unit: "M" });
    expect(parseCalendarValue("185K")).toEqual({ value: 185, unit: "K" });
  });
  it("parses bare numbers", () => {
    expect(parseCalendarValue("52.1")).toEqual({ value: 52.1, unit: null });
  });
  it("returns nulls for empty or textual values", () => {
    expect(parseCalendarValue("")).toEqual({ value: null, unit: null });
    expect(parseCalendarValue("Tentative")).toEqual({ value: null, unit: null });
  });
});

describe("toYahooSymbol", () => {
  it("converts US class shares to dashes", () => {
    expect(toYahooSymbol("BRK.B", "")).toBe("BRK-B");
    expect(toYahooSymbol("AAPL", "")).toBe("AAPL");
  });
  it("appends LSE suffix and handles trailing dots", () => {
    expect(toYahooSymbol("AZN", ".L")).toBe("AZN.L");
    expect(toYahooSymbol("BT.A.", ".L")).toBe("BT-A.L");
    expect(toYahooSymbol("bt.a", ".L")).toBe("BT-A.L");
  });
});
