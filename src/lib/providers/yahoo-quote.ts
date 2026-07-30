import YahooFinance from "yahoo-finance2";
import { sleep } from "../http";

/**
 * Batched Yahoo quote data via yahoo-finance2 (handles Yahoo's cookie/crumb
 * auth internally — same sanctioned unofficial-wrapper approach as yfinance
 * in the brief). Used for market caps (index-weight proxy) and next earnings
 * dates (catalyst overlay for the reversal-risk gauge).
 */

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export interface QuoteFacts {
  symbol: string;
  marketCap: number | null;
  /** Next scheduled earnings date (ISO), when Yahoo knows it. */
  nextEarningsDate: string | null;
}

export interface SymbolSearchHit {
  symbol: string;
  name: string;
  exchange: string;
}

/** Free-text symbol/company search across all Yahoo-covered exchanges. */
export async function searchSymbols(query: string): Promise<SymbolSearchHit[]> {
  const res = await yf.search(query, { quotesCount: 8, newsCount: 0 });
  return res.quotes
    .filter(
      (q): q is typeof q & { symbol: string } =>
        "symbol" in q && typeof q.symbol === "string" &&
        "quoteType" in q && q.quoteType === "EQUITY",
    )
    .map((q) => {
      const rec = q as unknown as Record<string, unknown>;
      const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
      return {
        symbol: q.symbol,
        name: str(rec.shortname) ?? str(rec.longname) ?? q.symbol,
        exchange: str(rec.exchDisp) ?? "",
      };
    });
}

export interface Fundamentals {
  symbol: string;
  targetMeanPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  recommendationKey: string | null;
  recommendationMean: number | null;
  numberOfAnalystOpinions: number | null;
  dividendYield: number | null;
  trailingAnnualDividendRate: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  epsTrailingTwelveMonths: number | null;
  epsForward: number | null;
  priceToBook: number | null;
  bookValue: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  averageAnalystRating: string | null;
  regularMarketPrice: number | null;
}

export async function getFundamentals(symbols: string[]): Promise<Map<string, Fundamentals>> {
  const map = new Map<string, Fundamentals>();
  if (symbols.length === 0) return map;
  try {
    for (let i = 0; i < symbols.length; i += CHUNK) {
      const chunk = symbols.slice(i, i + CHUNK);
      const quotes = await yf.quote(chunk);
      for (const q of quotes) {
        const r = q as unknown as Record<string, unknown>;
        const num = (k: string): number | null => {
          const v = r[k];
          return typeof v === "number" && isFinite(v) ? v : null;
        };
        const str = (k: string): string | null => {
          const v = r[k];
          return typeof v === "string" ? v : null;
        };
        map.set(q.symbol, {
          symbol: q.symbol,
          targetMeanPrice: num("targetMeanPrice"),
          targetHighPrice: num("targetHighPrice"),
          targetLowPrice: num("targetLowPrice"),
          recommendationKey: str("recommendationKey"),
          recommendationMean: num("recommendationMean"),
          numberOfAnalystOpinions: num("numberOfAnalystOpinions"),
          dividendYield: num("dividendYield"),
          trailingAnnualDividendRate: num("trailingAnnualDividendRate"),
          trailingPE: num("trailingPE"),
          forwardPE: num("forwardPE"),
          epsTrailingTwelveMonths: num("epsTrailingTwelveMonths"),
          epsForward: num("epsForward"),
          priceToBook: num("priceToBook"),
          bookValue: num("bookValue"),
          fiftyTwoWeekHigh: num("fiftyTwoWeekHigh"),
          fiftyTwoWeekLow: num("fiftyTwoWeekLow"),
          averageAnalystRating: str("averageAnalystRating"),
          regularMarketPrice: num("regularMarketPrice"),
        });
      }
      if (i + CHUNK < symbols.length) await sleep(500);
    }
  } catch {
    // Yahoo unreachable — return whatever we have so far
  }
  return map;
}

const CHUNK = 50;

export async function getQuoteFacts(symbols: string[]): Promise<QuoteFacts[]> {
  const out: QuoteFacts[] = [];
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const chunk = symbols.slice(i, i + CHUNK);
    const quotes = await yf.quote(chunk);
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    for (const s of chunk) {
      const q = bySymbol.get(s);
      out.push({
        symbol: s,
        marketCap: q?.marketCap ?? null,
        nextEarningsDate: q?.earningsTimestamp
          ? new Date(q.earningsTimestamp).toISOString()
          : null,
      });
    }
    await sleep(500);
  }
  return out;
}
