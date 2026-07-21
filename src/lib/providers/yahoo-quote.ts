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
