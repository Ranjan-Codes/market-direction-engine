import { describe, expect, it } from "vitest";
import { rollupWeekly } from "./rollup";
import type { AdjustedDailyBar } from "../providers/yahoo";

function bar(
  date: string,
  o: number,
  h: number,
  l: number,
  c: number,
  v: number,
  adjFactor = 1,
): AdjustedDailyBar {
  return {
    date,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
    adjFactor,
    currency: "USD",
  };
}

describe("rollupWeekly", () => {
  // 2026-07-20 (Mon) … 2026-07-24 (Fri)
  const week = [
    bar("2026-07-20", 100, 105, 99, 104, 1000),
    bar("2026-07-21", 104, 110, 103, 108, 1200),
    bar("2026-07-22", 108, 109, 101, 102, 900),
    bar("2026-07-23", 102, 107, 102, 106, 1100),
    bar("2026-07-24", 106, 112, 105, 111, 1300),
  ];

  it("aggregates OHLCV correctly over a full week", () => {
    const [w] = rollupWeekly(week);
    expect(w.weekEnd).toBe("2026-07-24");
    expect(w.weekStart).toBe("2026-07-20");
    expect(w.open).toBe(100); // first day's open
    expect(w.high).toBe(112); // max high
    expect(w.low).toBe(99); // min low
    expect(w.close).toBe(111); // last day's close
    expect(w.volume).toBe(5500); // sum
  });

  it("handles holiday-shortened weeks (week_end stays Friday)", () => {
    // Monday holiday: week starts Tuesday
    const [w] = rollupWeekly(week.slice(1));
    expect(w.weekEnd).toBe("2026-07-24");
    expect(w.weekStart).toBe("2026-07-21");
    expect(w.open).toBe(104);
  });

  it("applies adjustment factors to adjusted fields only", () => {
    const adjusted = week.map((b) => ({ ...b, adjFactor: 0.5 }));
    const [w] = rollupWeekly(adjusted);
    expect(w.close).toBe(111); // raw untouched
    expect(w.adjClose).toBeCloseTo(55.5);
    expect(w.adjHigh).toBeCloseTo(56);
    expect(w.adjVolume).toBe(11000); // volume scales inversely
  });

  it("splits multiple weeks and sorts ascending", () => {
    const twoWeeks = [
      bar("2026-07-27", 111, 115, 110, 114, 1000), // following Monday
      ...week,
    ];
    const rolled = rollupWeekly(twoWeeks);
    expect(rolled.map((w) => w.weekEnd)).toEqual(["2026-07-24", "2026-07-31"]);
  });

  it("ignores null-price days in aggregates", () => {
    const withNull = [
      ...week,
      { ...bar("2026-07-22", 0, 0, 0, 0, 0), high: null, low: null, volume: null },
    ];
    const [w] = rollupWeekly(withNull as AdjustedDailyBar[]);
    expect(w.high).toBe(112);
    expect(w.low).toBe(99);
  });
});
