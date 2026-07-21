import { describe, expect, it } from "vitest";
import { weekEndFriday, weekStartMonday } from "./weeks";

describe("weekEndFriday", () => {
  it("maps every weekday of a week to that week's Friday", () => {
    // 2026-07-20 is a Monday; Friday is 2026-07-24.
    expect(weekEndFriday("2026-07-20")).toBe("2026-07-24"); // Mon
    expect(weekEndFriday("2026-07-22")).toBe("2026-07-24"); // Wed
    expect(weekEndFriday("2026-07-24")).toBe("2026-07-24"); // Fri
  });

  it("assigns Saturday to the week just ended and Sunday to the week ahead", () => {
    expect(weekEndFriday("2026-07-25")).toBe("2026-07-24"); // Sat
    expect(weekEndFriday("2026-07-26")).toBe("2026-07-31"); // Sun
  });

  it("handles month and year boundaries", () => {
    expect(weekEndFriday("2025-12-31")).toBe("2026-01-02"); // Wed → Fri next year
  });

  it("rejects invalid input", () => {
    expect(() => weekEndFriday("not-a-date")).toThrow();
  });
});

describe("weekStartMonday", () => {
  it("returns the Monday of the same trading week", () => {
    expect(weekStartMonday("2026-07-24")).toBe("2026-07-20");
    expect(weekStartMonday("2026-07-20")).toBe("2026-07-20");
    expect(weekStartMonday("2026-07-25")).toBe("2026-07-20"); // Sat
  });
});
