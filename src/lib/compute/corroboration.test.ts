import { describe, expect, it } from "vitest";

import {
  corroborateBias,
  corroborateScore,
  corroborationLabel,
  SOCIAL_DEADBAND,
} from "./corroboration";

describe("corroborateScore", () => {
  it("returns silent when direction is null", () => {
    expect(corroborateScore(null, 0.9)).toBe("silent");
  });

  it("returns silent when score is null or NaN", () => {
    expect(corroborateScore("bullish", null)).toBe("silent");
    expect(corroborateScore("bullish", undefined)).toBe("silent");
    expect(corroborateScore("bullish", Number.NaN)).toBe("silent");
  });

  it("treats scores inside the deadband as silent", () => {
    expect(corroborateScore("bullish", SOCIAL_DEADBAND)).toBe("silent");
    expect(corroborateScore("bullish", -SOCIAL_DEADBAND)).toBe("silent");
    expect(corroborateScore("bullish", 0)).toBe("silent");
  });

  it("confirms when a strong score agrees with the direction", () => {
    expect(corroborateScore("bullish", 0.6)).toBe("confirms");
    expect(corroborateScore("bearish", -0.6)).toBe("confirms");
  });

  it("contradicts when a strong score opposes the direction", () => {
    expect(corroborateScore("bullish", -0.6)).toBe("contradicts");
    expect(corroborateScore("bearish", 0.6)).toBe("contradicts");
  });

  it("respects a custom deadband", () => {
    expect(corroborateScore("bullish", 0.2, 0.3)).toBe("silent");
    expect(corroborateScore("bullish", 0.4, 0.3)).toBe("confirms");
  });
});

describe("corroborateBias", () => {
  it("returns silent when either input is null", () => {
    expect(corroborateBias(null, "bullish")).toBe("silent");
    expect(corroborateBias("bullish", null)).toBe("silent");
  });

  it("confirms matching bias and contradicts opposing bias", () => {
    expect(corroborateBias("bullish", "bullish")).toBe("confirms");
    expect(corroborateBias("bearish", "bearish")).toBe("confirms");
    expect(corroborateBias("bullish", "bearish")).toBe("contradicts");
  });
});

describe("corroborationLabel", () => {
  it("maps states to human-facing labels", () => {
    expect(corroborationLabel("confirms")).toBe("Confirms");
    expect(corroborationLabel("contradicts")).toBe("Contradicts");
    expect(corroborationLabel("silent")).toBe("Silent");
  });
});

