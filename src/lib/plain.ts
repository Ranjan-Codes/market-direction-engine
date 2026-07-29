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

// ── Technical indicator interpretation ───────────────────────────────────────

export interface TechnicalSnapshot {
  rsi_14: number | null;
  rsi_divergence: string | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  bb_pct_b: number | null;
  bb_squeeze: boolean | null;
  bb_band_walk: string | null;
  volume_vs_20w: number | null;
  price_vs_ma_30w: number | null;
  price_vs_ma_40w: number | null;
  ma_30w_slope: number | null;
  ma_40w_slope: number | null;
  ma_cross: string | null;
  adx_14: number | null;
  di_plus: number | null;
  di_minus: number | null;
  pos_52w_range: number | null;
  close: number | null;
}

export interface IndicatorReading {
  id: string;
  name: string;
  value: string;
  reading: string;
  signal: "bullish" | "bearish" | "neutral" | "caution";
  confidence: number;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Math.round(v)));

export function interpretIndicators(t: TechnicalSnapshot): IndicatorReading[] {
  const out: IndicatorReading[] = [];

  // 1. RSI (14)
  if (t.rsi_14 != null) {
    const rsi = t.rsi_14;
    let reading: string, signal: IndicatorReading["signal"], conf: number;
    if (rsi > 75) { reading = "Overbought"; signal = "caution"; conf = 70 + (rsi - 75) * 2; }
    else if (rsi > 70) { reading = "Overbought zone"; signal = "caution"; conf = 50 + (rsi - 70) * 4; }
    else if (rsi > 55) { reading = "Bullish momentum"; signal = "bullish"; conf = 20 + (rsi - 55) * 2.5; }
    else if (rsi >= 45) { reading = "Neutral"; signal = "neutral"; conf = Math.abs(rsi - 50) * 4; }
    else if (rsi >= 30) { reading = "Bearish momentum"; signal = "bearish"; conf = 20 + (45 - rsi) * 2.5; }
    else if (rsi >= 25) { reading = "Oversold zone"; signal = "caution"; conf = 50 + (30 - rsi) * 4; }
    else { reading = "Oversold"; signal = "caution"; conf = 70 + (25 - rsi) * 2; }
    out.push({ id: "rsi", name: "RSI (14)", value: rsi.toFixed(1), reading, signal, confidence: clamp(conf) });
  }

  // 2. Bollinger Band
  if (t.bb_pct_b != null) {
    const pctB = t.bb_pct_b;
    let reading: string, signal: IndicatorReading["signal"], conf: number;
    if (t.bb_band_walk === "upper") { reading = "Upper band walk"; signal = "bullish"; conf = 82; }
    else if (t.bb_band_walk === "lower") { reading = "Lower band walk"; signal = "bearish"; conf = 82; }
    else if (t.bb_squeeze) { reading = "Squeeze — breakout pending"; signal = "neutral"; conf = 65; }
    else if (pctB > 0.95) { reading = "At upper band"; signal = "caution"; conf = 78; }
    else if (pctB < 0.05) { reading = "At lower band"; signal = "caution"; conf = 78; }
    else if (pctB > 0.65) { reading = "Upper half — bullish"; signal = "bullish"; conf = 25 + (pctB - 0.65) * 160; }
    else if (pctB < 0.35) { reading = "Lower half — bearish"; signal = "bearish"; conf = 25 + (0.35 - pctB) * 160; }
    else { reading = "Mid-range"; signal = "neutral"; conf = 10; }
    out.push({ id: "bollinger", name: "Bollinger Band", value: `%B ${pctB.toFixed(2)}`, reading, signal, confidence: clamp(conf) });
  }

  // 3. MACD
  if (t.macd_hist != null && t.close) {
    const hist = t.macd_hist;
    const pctHist = (hist / t.close) * 100;
    const expanding = t.macd != null && t.macd_signal != null
      ? (hist > 0 ? t.macd > t.macd_signal : t.macd < t.macd_signal)
      : true;
    const signal: IndicatorReading["signal"] = hist > 0 ? "bullish" : "bearish";
    const reading = `${hist > 0 ? "Bullish" : "Bearish"} — ${expanding ? "expanding" : "fading"}`;
    out.push({ id: "macd", name: "MACD", value: `${hist > 0 ? "+" : ""}${pctHist.toFixed(2)}%`, reading, signal, confidence: clamp(Math.abs(pctHist) * 35 + 10, 0, 90) });
  }

  // 4. Volume Breakout
  if (t.volume_vs_20w != null) {
    const vol = t.volume_vs_20w;
    let reading: string, signal: IndicatorReading["signal"], conf: number;
    if (vol > 2.0) { reading = "Surge — breakout volume"; signal = "bullish"; conf = 88; }
    else if (vol > 1.5) { reading = "Heavy — above average"; signal = "bullish"; conf = 65; }
    else if (vol > 1.1) { reading = "Slightly above average"; signal = "bullish"; conf = 30; }
    else if (vol >= 0.8) { reading = "Normal activity"; signal = "neutral"; conf = 8; }
    else if (vol >= 0.5) { reading = "Light — low conviction"; signal = "neutral"; conf = 25; }
    else { reading = "Very light — no interest"; signal = "bearish"; conf = 45; }
    out.push({ id: "volume", name: "Volume Breakout", value: `${vol.toFixed(1)}x avg`, reading, signal, confidence: clamp(conf) });
  }

  // 5. Price Breakout (52w range position)
  if (t.pos_52w_range != null) {
    const pos = t.pos_52w_range;
    let reading: string, signal: IndicatorReading["signal"], conf: number;
    if (pos > 0.95) { reading = "At 52-week high"; signal = "bullish"; conf = 88; }
    else if (pos > 0.80) { reading = "Near highs — strong"; signal = "bullish"; conf = 55 + (pos - 0.8) * 200; }
    else if (pos > 0.60) { reading = "Upper range"; signal = "bullish"; conf = 30 + (pos - 0.6) * 100; }
    else if (pos >= 0.40) { reading = "Mid-range"; signal = "neutral"; conf = 10; }
    else if (pos >= 0.20) { reading = "Lower range"; signal = "bearish"; conf = 30 + (0.4 - pos) * 100; }
    else if (pos >= 0.05) { reading = "Near lows — weak"; signal = "bearish"; conf = 55 + (0.2 - pos) * 200; }
    else { reading = "At 52-week low"; signal = "bearish"; conf = 88; }
    out.push({ id: "range", name: "Price Breakout", value: `${(pos * 100).toFixed(0)}% of 52w`, reading, signal, confidence: clamp(conf, 0, 95) });
  }

  // 6. Trend Strength (ADX + DI direction)
  if (t.adx_14 != null) {
    const adx = t.adx_14;
    const up = t.di_plus != null && t.di_minus != null && t.di_plus > t.di_minus;
    let reading: string, signal: IndicatorReading["signal"], conf: number;
    if (adx > 40) { reading = `Very strong trend ${up ? "↑" : "↓"}`; signal = up ? "bullish" : "bearish"; conf = 90; }
    else if (adx > 25) { reading = `Trending ${up ? "↑" : "↓"}`; signal = up ? "bullish" : "bearish"; conf = 45 + (adx - 25) * 3; }
    else if (adx > 20) { reading = "Weak trend"; signal = "neutral"; conf = 25; }
    else { reading = "No trend — choppy"; signal = "neutral"; conf = 12; }
    out.push({ id: "adx", name: "Trend Strength", value: `ADX ${adx.toFixed(0)}`, reading, signal, confidence: clamp(conf) });
  }

  // 7. Moving Averages (30w/40w)
  if (t.price_vs_ma_30w != null && t.price_vs_ma_40w != null) {
    const pct30 = t.price_vs_ma_30w * 100;
    const above30 = t.price_vs_ma_30w > 0;
    const above40 = t.price_vs_ma_40w > 0;
    const slope30up = (t.ma_30w_slope ?? 0) > 0;
    let reading: string, signal: IndicatorReading["signal"], conf: number;
    if (t.ma_cross === "golden") { reading = "Golden cross — bullish"; signal = "bullish"; conf = 82; }
    else if (t.ma_cross === "death") { reading = "Death cross — bearish"; signal = "bearish"; conf = 82; }
    else if (above30 && above40 && slope30up) { reading = "Above rising averages"; signal = "bullish"; conf = 72; }
    else if (!above30 && !above40 && !slope30up) { reading = "Below falling averages"; signal = "bearish"; conf = 72; }
    else if (above30 && above40) { reading = "Above both averages"; signal = "bullish"; conf = 50; }
    else if (!above30 && !above40) { reading = "Below both averages"; signal = "bearish"; conf = 50; }
    else { reading = "Between averages — mixed"; signal = "neutral"; conf = 25; }
    out.push({ id: "ma", name: "Moving Averages", value: `${pct30 > 0 ? "+" : ""}${pct30.toFixed(1)}% vs 30w`, reading, signal, confidence: clamp(conf) });
  }

  // 8. RSI Divergence
  if (t.rsi_divergence === "bullish") {
    out.push({ id: "divergence", name: "RSI Divergence", value: "Bullish", reading: "Price low, momentum rising — reversal hint", signal: "bullish", confidence: 75 });
  } else if (t.rsi_divergence === "bearish") {
    out.push({ id: "divergence", name: "RSI Divergence", value: "Bearish", reading: "Price high, momentum fading — warning", signal: "bearish", confidence: 75 });
  } else {
    out.push({ id: "divergence", name: "RSI Divergence", value: "None", reading: "No divergence detected", signal: "neutral", confidence: 0 });
  }

  return out;
}

export const TONE_STYLE: Record<VerdictView["tone"], { border: string; text: string; chip: string }> = {
  danger: { border: "border-red-300", text: "text-red-700", chip: "bg-red-100 text-red-800" },
  opportunity: { border: "border-green-300", text: "text-green-700", chip: "bg-green-100 text-green-800" },
  good: { border: "border-emerald-300", text: "text-emerald-700", chip: "bg-emerald-100 text-emerald-800" },
  caution: { border: "border-amber-300", text: "text-amber-700", chip: "bg-amber-100 text-amber-800" },
  bad: { border: "border-orange-300", text: "text-orange-700", chip: "bg-orange-100 text-orange-800" },
};
