import type { RateLimit } from "@/lib/providers/types";

/**
 * All provider limits, TTLs, and routing priority live here — config, not
 * code. Verify each provider's current published limits at implementation
 * time (Phase 1) and update; free tiers change without notice.
 */

export const PROVIDER_PRIORITY = {
  /** Order matters: first provider that covers the symbol wins; rest are fallbacks. */
  marketData: ["stooq", "yfinance", "tiingo", "twelvedata", "alphavantage", "eodhd"],
  macro: ["fred", "ons", "boe", "bls"],
} as const;

export const RATE_LIMITS: Record<string, RateLimit> = {
  stooq: { minIntervalMs: 1_000 },              // no published API limit; be polite
  yfinance: { requestsPerMinute: 30 },          // unofficial — conservative
  alphavantage: { requestsPerDay: 25 },         // free tier hard cap
  tiingo: { requestsPerDay: 500, requestsPerMinute: 50 },
  twelvedata: { requestsPerDay: 800, requestsPerMinute: 8 },
  eodhd: { requestsPerDay: 20 },
  fred: { requestsPerMinute: 60 },
  gdelt: { minIntervalMs: 5_000 },
  reddit: { requestsPerMinute: 60 },
  stocktwits: { requestsPerMinute: 30 },
};

/** Cache TTLs in seconds, by data class. */
export const CACHE_TTL_SECONDS = {
  ohlcvEod: 6 * 60 * 60,        // refreshed once per day post-close anyway
  macroSeries: 12 * 60 * 60,    // released on schedules, not continuously
  economicCalendar: 6 * 60 * 60,
  sentimentFeeds: 2 * 60 * 60,
  constituents: 7 * 24 * 60 * 60,
} as const;
