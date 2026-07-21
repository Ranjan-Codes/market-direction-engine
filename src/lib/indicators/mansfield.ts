import { sma } from "./moving";

export interface MansfieldPoint {
  /** Mansfield relative strength: % above/below the 52w MA of the RS line. */
  rs: number | null;
  trend: "leading" | "lagging" | "neutral" | null;
}

/**
 * Mansfield relative performance of a stock vs its own index:
 * RP = close / indexClose; Mansfield RS = (RP / SMA_period(RP) - 1) × 100.
 * Positive & rising ⇒ leading the market; negative & falling ⇒ lagging.
 */
export function mansfieldRs(
  closes: (number | null)[],
  indexCloses: (number | null)[],
  period: number,
  trendWeeks: number,
): MansfieldPoint[] {
  const rp = closes.map((c, i) => {
    const ic = indexCloses[i];
    return c != null && ic != null && ic !== 0 ? c / ic : null;
  });
  const rpMa = sma(rp, period);
  const rs = rp.map((v, i) => {
    const m = rpMa[i];
    return v != null && m != null && m !== 0 ? (v / m - 1) * 100 : null;
  });
  return rs.map((v, i) => {
    if (v == null) return { rs: null, trend: null };
    const past = i >= trendWeeks ? rs[i - trendWeeks] : null;
    // Above the zero line and not deteriorating ⇒ leading (a constant
    // positive RS — steady outperformance — counts; ε absorbs float noise).
    const EPS = 1e-9;
    let trend: MansfieldPoint["trend"] = "neutral";
    if (past != null) {
      if (v > 0 && v >= past - EPS) trend = "leading";
      else if (v < 0 && v <= past + EPS) trend = "lagging";
    }
    return { rs: v, trend };
  });
}
