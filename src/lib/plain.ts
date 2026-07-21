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

export interface Insight {
  text: string;
  tone: "good" | "warn" | "neutral";
}

interface RegimeLike {
  symbol: string;
  breadth_score: number | null;
  breakdown: {
    inputs: Record<string, Record<string, unknown> | null>;
    gauge: { direction: string; intensity: number };
  };
  history: Array<{ date: string; composite: number; gaugeIntensity: number }>;
}

const n = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

/**
 * Plain-English observations derived from the regime inputs — the "so what"
 * layer. Each maps a number the engine already computed to a sentence a
 * reader can act on.
 */
export function buildInsights(regimes: RegimeLike[]): Insight[] {
  const out: Insight[] = [];
  const us = regimes.find((r) => r.symbol === "SPX") ?? regimes[0];
  if (!us) return out;
  const im = us.breakdown.inputs?.intermarket ?? {};
  const pos = us.breakdown.inputs?.positioning ?? {};

  // Gauge trajectory per index — is warning pressure building or easing?
  for (const r of regimes) {
    const now = r.history.at(-1)?.gaugeIntensity ?? null;
    const past = r.history.at(-5)?.gaugeIntensity ?? null;
    if (now != null && past != null && Math.abs(now - past) >= 10) {
      out.push({
        tone: now > past ? "warn" : "good",
        text:
          now > past
            ? `Warning pressure on the ${r.symbol === "SPX" ? "S&P 500" : r.symbol === "NDX" ? "Nasdaq" : "FTSE"} has been building — reversal evidence at ${now}/100 vs ${past} a month ago.`
            : `Reversal pressure on ${r.symbol} is easing — ${now}/100 vs ${past} a month ago.`,
      });
    }
  }

  const curve = n(im["curve"]);
  if (curve != null) {
    out.push(
      curve > 0.1
        ? { tone: "good", text: `The US yield curve is comfortably positive (+${curve.toFixed(2)}%) — the classic recession warning from the bond market is absent.` }
        : curve < 0
          ? { tone: "warn", text: `The US yield curve is inverted (${curve.toFixed(2)}%) — historically a recession lead of 6–18 months.` }
          : { tone: "neutral", text: "The US yield curve is roughly flat — the bond market is undecided." },
    );
  }
  const hyZ = n(im["hyOasZ"]);
  if (hyZ != null) {
    out.push(
      hyZ > 1
        ? { tone: "warn", text: "Credit spreads are widening — bond investors are starting to price stress, which usually shows up before equities react." }
        : hyZ < -0.5
          ? { tone: "good", text: "Credit spreads are tighter than usual — bond investors see very little stress ahead." }
          : { tone: "neutral", text: "Credit spreads sit near their recent norms — no stress signal from the bond market." },
    );
  }
  const rot = n(im["cyclicalsVsDefensives13w"]);
  if (rot != null && Math.abs(rot) > 0.03) {
    out.push(
      rot > 0
        ? { tone: "good", text: `Cyclical sectors have beaten defensives by ${(rot * 100).toFixed(0)}% over 13 weeks — investors are still reaching for growth, not hiding.` }
        : { tone: "warn", text: `Money has rotated into defensive sectors (${(rot * 100).toFixed(0)}% vs cyclicals over 13 weeks) — quiet risk-off behaviour under the surface.` },
    );
  }
  const dxy = n(im["dxy13w"]);
  if (dxy != null && Math.abs(dxy) > 0.03) {
    out.push(
      dxy > 0
        ? { tone: "warn", text: `The dollar has strengthened ${(dxy * 100).toFixed(0)}% in 13 weeks — a headwind for equities if it continues.` }
        : { tone: "good", text: `The dollar has weakened ${(-dxy * 100).toFixed(0)}% in 13 weeks — a tailwind for risk assets.` },
    );
  }
  const vixP = n(pos["vixPctile"]);
  if (vixP != null) {
    if (vixP < 15) out.push({ tone: "warn", text: `Volatility sits in the ${vixP.toFixed(0)}th percentile of the last two years — markets this calm are complacent, and complacency precedes corrections.` });
    else if (vixP > 85) out.push({ tone: "good", text: `Volatility is in the ${vixP.toFixed(0)}th percentile — fear this elevated has historically been closer to bottoms than tops.` });
  }
  const cotZ = n(pos["cotZ"]);
  if (cotZ != null && Math.abs(cotZ) > 1.5) {
    out.push({
      tone: "warn",
      text: cotZ > 0
        ? "Speculators are unusually crowded on the long side of index futures — crowded trades unwind violently."
        : "Speculators are unusually short index futures — heavy pessimism often fuels rebounds when it reverses.",
    });
  }
  // Breadth health across indices.
  for (const r of regimes) {
    const b = r.breakdown.inputs?.breadth ?? {};
    const p200 = n(b["pctAbove200d"]);
    if (p200 != null && (p200 >= 75 || p200 <= 40)) {
      out.push(
        p200 >= 75
          ? { tone: "good", text: `${r.symbol}: ${p200.toFixed(0)}% of members trade above their 200-day average — broad, healthy participation.` }
          : { tone: "warn", text: `${r.symbol}: only ${p200.toFixed(0)}% of members are above their 200-day average — the rally is standing on few legs.` },
      );
    }
  }
  return out.slice(0, 7);
}

export const TONE_STYLE: Record<VerdictView["tone"], { border: string; text: string; chip: string }> = {
  danger: { border: "border-red-300", text: "text-red-700", chip: "bg-red-100 text-red-800" },
  opportunity: { border: "border-green-300", text: "text-green-700", chip: "bg-green-100 text-green-800" },
  good: { border: "border-emerald-300", text: "text-emerald-700", chip: "bg-emerald-100 text-emerald-800" },
  caution: { border: "border-amber-300", text: "text-amber-700", chip: "bg-amber-100 text-amber-800" },
  bad: { border: "border-orange-300", text: "text-orange-700", chip: "bg-orange-100 text-orange-800" },
};
