import { getPool } from "../db";
import { getFundamentals, type Fundamentals } from "../providers/yahoo-quote";
import {
  corroborateBias,
  corroborateScore,
  type Bias,
  type Corroboration,
  type Direction,
} from "../compute/corroboration";

/**
 * Non-technical context for a single stock, powering the drill-down page
 * beyond the price chart: retail/social sentiment, sell-side (brokerage)
 * expectations, and a light fundamental bias. Every field is nullable and
 * "silent"-safe so the UI can honestly show "no data yet" rather than
 * fabricating a reading. These are corroboration layers for the technical
 * signal, never a blended replacement for it.
 */

export interface SocialReading {
  source: string;
  score: number | null;
  volume: number | null;
  readingAt: string | null;
  corroboration: Corroboration;
}

export interface AnalystView {
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
  targetMeanPrice: number | null;
  regularMarketPrice: number | null;
  /** Upside to mean target as a fraction, e.g. 0.12 = +12%. */
  upside: number | null;
  epsForward: number | null;
  epsTrailingTwelveMonths: number | null;
  dividendYield: number | null;
  corroboration: Corroboration;
}

export interface StockContext {
  social: SocialReading[];
  analyst: AnalystView | null;
  expectedBias: Bias;
  expectedBiasCorroboration: Corroboration;
}

interface SentimentRow {
  source: string;
  score: number | null;
  volume: number | null;
  reading_at: string | null;
}

/** Latest per-source instrument-scoped sentiment reading for a symbol. */
async function latestSocial(symbol: string): Promise<SentimentRow[]> {
  const pool = getPool();
  const { rows }: { rows: SentimentRow[] } = await pool.query(
    `select distinct on (source)
            source, score::float8 as score, volume, reading_at::text as reading_at
       from sentiment_readings
      where scope_type = 'instrument' and scope_key = $1
      order by source, reading_at desc`,
    [symbol],
  );
  return rows;
}

/**
 * Derive a discrete fundamental bias from sell-side consensus, mirroring the
 * earnings-ingestion rule: require at least two of three independent reads
 * (EPS growth, analyst rating, price-target upside) to agree, else null.
 */
function deriveBias(f: Fundamentals | undefined): Bias {
  if (!f) return null;
  const votes: Bias[] = [];

  if (f.epsForward != null && f.epsTrailingTwelveMonths != null) {
    if (f.epsForward > f.epsTrailingTwelveMonths) votes.push("bullish");
    else if (f.epsForward < f.epsTrailingTwelveMonths) votes.push("bearish");
  }

  if (f.recommendationKey) {
    const key = f.recommendationKey.toLowerCase();
    if (key.includes("buy")) votes.push("bullish");
    else if (key.includes("sell") || key === "underperform") votes.push("bearish");
  }

  if (f.targetMeanPrice != null && f.regularMarketPrice != null && f.regularMarketPrice > 0) {
    const upside = (f.targetMeanPrice - f.regularMarketPrice) / f.regularMarketPrice;
    if (upside > 0.03) votes.push("bullish");
    else if (upside < -0.03) votes.push("bearish");
  }

  const bullish = votes.filter((v) => v === "bullish").length;
  const bearish = votes.filter((v) => v === "bearish").length;
  if (bullish >= 2 && bullish > bearish) return "bullish";
  if (bearish >= 2 && bearish > bullish) return "bearish";
  return null;
}

function buildAnalyst(f: Fundamentals | undefined, direction: Direction): AnalystView | null {
  if (!f) return null;
  const upside =
    f.targetMeanPrice != null && f.regularMarketPrice != null && f.regularMarketPrice > 0
      ? (f.targetMeanPrice - f.regularMarketPrice) / f.regularMarketPrice
      : null;
  return {
    recommendationKey: f.recommendationKey ?? null,
    numberOfAnalystOpinions: f.numberOfAnalystOpinions ?? null,
    targetMeanPrice: f.targetMeanPrice ?? null,
    regularMarketPrice: f.regularMarketPrice ?? null,
    upside,
    epsForward: f.epsForward ?? null,
    epsTrailingTwelveMonths: f.epsTrailingTwelveMonths ?? null,
    dividendYield: f.dividendYield ?? null,
    corroboration: corroborateBias(direction, deriveBias(f)),
  };
}

/**
 * Assemble the full non-technical context for a stock. `direction` is the
 * current technical signal direction, used to resolve each layer to
 * confirms / contradicts / silent. Fails soft: any provider error yields
 * empty/silent context rather than throwing.
 */
export async function getStockContext(
  symbol: string,
  direction: Direction,
): Promise<StockContext> {
  let socialRows: SentimentRow[] = [];
  let fundamentals: Fundamentals | undefined;

  try {
    socialRows = await latestSocial(symbol);
  } catch {
    socialRows = [];
  }

  try {
    const map = await getFundamentals([symbol]);
    fundamentals = map.get(symbol);
  } catch {
    fundamentals = undefined;
  }

  const social: SocialReading[] = socialRows.map((r) => ({
    source: r.source,
    score: r.score,
    volume: r.volume,
    readingAt: r.reading_at,
    corroboration: corroborateScore(direction, r.score),
  }));

  const expectedBias = deriveBias(fundamentals);

  return {
    social,
    analyst: buildAnalyst(fundamentals, direction),
    expectedBias,
    expectedBiasCorroboration: corroborateBias(direction, expectedBias),
  };
}

