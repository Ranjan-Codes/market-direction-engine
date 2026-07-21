/**
 * Plain-English translations of engine outputs — the human layer. Jargon
 * stays available on detail pages; first-glance surfaces use these.
 */

const EVIDENCE_PLAIN: Record<string, string> = {
  rsiHot: "The market has risen unusually fast",
  rsiExtreme: "…and is now at an extreme",
  priceStretched: "Price is at the very top of its one-year range",
  bearishDivergence: "New price highs, but momentum is fading underneath",
  breadthDivergence: "The index is rising while most of its stocks weaken",
  mcclellanCross: "Fewer and fewer stocks are participating in the rally",
  positioningExtreme: "Speculators are crowded on one side of the market",
  narrativeEuphoria: "News tone has turned euphoric",
  vixComplacency: "Markets look unusually calm — complacency",
  internalsLagging: "The average stock is weakening beneath the surface",
  rsiCold: "The market has fallen unusually fast",
  priceWashedOut: "Price is at the very bottom of its one-year range",
  bullishDivergence: "New price lows, but selling pressure is fading",
  breadthWashout: "Almost everything has already been sold down",
  mcclellanTurn: "Participation is turning back up from washed-out levels",
  narrativeDespair: "News tone has turned to despair",
  vixPanic: "Fear is at an extreme",
  internalsFirming: "The average stock is quietly strengthening",
};

export function plainEvidence(item: string, fallback: string): string {
  return EVIDENCE_PLAIN[item] ?? fallback;
}

export interface VerdictView {
  tone: "danger" | "opportunity" | "good" | "caution" | "bad";
  headline: string;
  sub: string;
}

/** One-sentence market verdict per index from regime + gauge. */
export function marketVerdict(
  regime: string,
  gaugeDirection: string,
  gaugeIntensity: number,
): VerdictView {
  if (gaugeDirection === "overbought-reversal-risk") {
    return {
      tone: "danger",
      headline: "Stretched — profit-booking risk is building",
      sub: `Warning strength ${gaugeIntensity}/100. A pullback within the next few weeks has become more likely.`,
    };
  }
  if (gaugeDirection === "oversold-rebound-setup") {
    return {
      tone: "opportunity",
      headline: "Washed out — a rebound setup is forming",
      sub: `Setup strength ${gaugeIntensity}/100. Markets this stretched to the downside often recover over the following weeks.`,
    };
  }
  if (regime === "risk_on") {
    return {
      tone: "good",
      headline: "Healthy uptrend — no warning signs",
      sub: "Conditions favour staying invested; no overbought stretch detected.",
    };
  }
  if (regime === "risk_off") {
    return {
      tone: "bad",
      headline: "Defensive — conditions are hostile",
      sub: "The market backdrop argues against new buying; capital preservation first.",
    };
  }
  return {
    tone: "caution",
    headline: "Mixed — no clear direction",
    sub: "Evidence is split; be selective and keep positions moderate.",
  };
}

export const TONE_STYLE: Record<VerdictView["tone"], { border: string; text: string; chip: string }> = {
  danger: { border: "border-red-700/70", text: "text-red-300", chip: "bg-red-950 text-red-300" },
  opportunity: { border: "border-green-700/70", text: "text-green-300", chip: "bg-green-950 text-green-300" },
  good: { border: "border-emerald-800/60", text: "text-emerald-300", chip: "bg-emerald-950 text-emerald-300" },
  caution: { border: "border-amber-800/60", text: "text-amber-300", chip: "bg-amber-950 text-amber-200" },
  bad: { border: "border-orange-800/70", text: "text-orange-300", chip: "bg-orange-950 text-orange-300" },
};
