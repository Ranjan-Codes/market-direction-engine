/**
 * Per-stock leading-indicator verdict for the watchlist — the stock-level
 * mirror of the index reversal gauge, in plain English with its evidence.
 * Decision support only; wording stays probabilistic.
 */

export interface SuggestionInput {
  direction: string | null; // signal direction
  conviction: number | null;
  gated: boolean;
  gateReason: string | null;
  factors: Record<string, number | null> | null;
  rsi14: number | null;
  pctB: number | null;
  pos52w: number | null;
  squeeze: boolean | null;
  rsiDivergence: string | null;
  rsTrend: string | null;
  indexGauge: { direction: string; intensity: number } | null;
  ownEarnings: string | null; // ISO date of next earnings if within 30d
}

export interface Suggestion {
  verdict:
    | "overbought-risk"
    | "oversold-setup"
    | "constructive"
    | "weak"
    | "mixed";
  headline: string;
  evidence: string[];
}

export function suggest(s: SuggestionInput): Suggestion {
  const over: string[] = [];
  const under: string[] = [];
  let overPts = 0;
  let underPts = 0;

  if (s.rsi14 != null && s.rsi14 > 70) {
    overPts += s.rsi14 > 75 ? 3 : 2;
    over.push(`weekly RSI ${s.rsi14.toFixed(0)} (overbought)`);
  }
  if (s.rsi14 != null && s.rsi14 < 30) {
    underPts += s.rsi14 < 25 ? 3 : 2;
    under.push(`weekly RSI ${s.rsi14.toFixed(0)} (oversold)`);
  }
  if (s.pctB != null && s.pos52w != null && s.pctB > 0.95 && s.pos52w > 0.9) {
    overPts += 2;
    over.push(`price stretched: top of Bollinger band at ${(s.pos52w * 100).toFixed(0)}% of 52w range`);
  }
  if (s.pctB != null && s.pos52w != null && s.pctB < 0.05 && s.pos52w < 0.1) {
    underPts += 2;
    under.push(`price washed out: bottom of Bollinger band near 52w low`);
  }
  if (s.rsiDivergence === "bearish") {
    overPts += 3;
    over.push("bearish weekly RSI divergence (leading)");
  }
  if (s.rsiDivergence === "bullish") {
    underPts += 3;
    under.push("bullish weekly RSI divergence (leading)");
  }
  if (s.indexGauge?.direction === "overbought-reversal-risk") {
    overPts += 2;
    over.push(`its index shows reversal risk (${s.indexGauge.intensity})`);
  }
  if (s.indexGauge?.direction === "oversold-rebound-setup") {
    underPts += 2;
    under.push(`its index shows rebound setup (${s.indexGauge.intensity})`);
  }
  if (s.rsTrend === "lagging") over.push("lagging its index (weak relative strength)");
  if (s.rsTrend === "leading") under.push("still leading its index on relative strength");

  const evidence: string[] = [];
  if (s.ownEarnings) evidence.push(`earnings ${s.ownEarnings.slice(0, 10)} — expect volatility, fresh entries blacked out`);
  if (s.squeeze) evidence.push("Bollinger squeeze: volatility expansion pending (direction-agnostic)");
  if (s.gated && s.gateReason) evidence.push(`regime gate: ${s.gateReason}`);

  if (overPts >= 4) {
    return {
      verdict: "overbought-risk",
      headline: "Overbought — elevated risk of profit-booking over the coming weeks",
      evidence: [...over, ...evidence],
    };
  }
  if (underPts >= 4) {
    return {
      verdict: "oversold-setup",
      headline: "Oversold — rebound setup building",
      evidence: [...under, ...evidence],
    };
  }
  if (s.direction === "bullish") {
    return {
      verdict: "constructive",
      headline: s.gated
        ? "Constructive but regime-gated — trend intact, market backdrop blocks fresh entries"
        : "Constructive — uptrend intact, no reversal evidence yet",
      evidence: [...over, ...under, ...evidence],
    };
  }
  if (s.direction === "bearish") {
    return {
      verdict: "weak",
      headline: "Weak — downtrend and poor relative strength; avoid or trim",
      evidence: [...over, ...under, ...evidence],
    };
  }
  return {
    verdict: "mixed",
    headline: "Mixed — no clear edge at the weekly horizon",
    evidence: [...over, ...under, ...evidence],
  };
}
