/**
 * v1 market universe. Add DAX, Nikkei, etc. here later — nothing else
 * should hardcode index membership or symbols.
 */
export interface IndexConfig {
  /** Our canonical key, used as instruments.symbol for the index. */
  key: string;
  name: string;
  country: "US" | "UK";
  currency: "USD" | "GBP";
  /** Yahoo chart symbol for the index itself. */
  yahooSymbol: string;
  /** Where current membership comes from; null = index-level data only. */
  constituentSource: "wikipedia" | "nasdaq-api" | null;
  /** Wikipedia page holding the constituents table (wikipedia source only). */
  wikipediaPage?: string;
  /** Suffix appended to constituent tickers to form Yahoo symbols (LSE = ".L"). */
  constituentSuffix: string;
}

export const INDICES: IndexConfig[] = [
  {
    key: "SPX",
    name: "S&P 500",
    country: "US",
    currency: "USD",
    yahooSymbol: "^GSPC",
    constituentSource: "wikipedia",
    wikipediaPage: "List_of_S%26P_500_companies",
    constituentSuffix: "",
  },
  {
    key: "NDX",
    name: "Nasdaq 100",
    country: "US",
    currency: "USD",
    yahooSymbol: "^NDX",
    // Wikipedia removed the Nasdaq-100 components table (2026-07); the
    // exchange's own list API is the free source instead.
    constituentSource: "nasdaq-api",
    constituentSuffix: "",
  },
  {
    key: "NYA",
    name: "NYSE Composite",
    country: "US",
    currency: "USD",
    yahooSymbol: "^NYA",
    // No free point-in-time membership source for ~1,900 NYSE names; index-level
    // data only in v1 (also keeps the Supabase free tier within its 500 MB cap).
    constituentSource: null,
    constituentSuffix: "",
  },
  {
    key: "UKX",
    name: "FTSE 100",
    country: "UK",
    currency: "GBP",
    yahooSymbol: "^FTSE",
    constituentSource: "wikipedia",
    wikipediaPage: "FTSE_100_Index",
    constituentSuffix: ".L",
  },
];

/**
 * Intermarket / cross-asset instruments (Layer 1C) ingested via Yahoo like
 * any other instrument. Sector ETFs feed defensive-vs-cyclical relative
 * strength; futures feed copper/gold and oil reads.
 */
export interface AuxInstrument {
  symbol: string; // Yahoo symbol, also our canonical symbol
  name: string;
  type: "index" | "etf" | "future" | "currency";
  role: string; // free-text tag used by the regime engine
}

export const INTERMARKET_INSTRUMENTS: AuxInstrument[] = [
  { symbol: "DX-Y.NYB", name: "US Dollar Index", type: "currency", role: "dxy" },
  { symbol: "GC=F", name: "Gold Futures", type: "future", role: "gold" },
  { symbol: "HG=F", name: "Copper Futures", type: "future", role: "copper" },
  { symbol: "CL=F", name: "WTI Crude Futures", type: "future", role: "oil" },
  { symbol: "^VIX", name: "CBOE Volatility Index", type: "index", role: "vix" },
  { symbol: "XLP", name: "Consumer Staples SPDR", type: "etf", role: "sector-defensive" },
  { symbol: "XLU", name: "Utilities SPDR", type: "etf", role: "sector-defensive" },
  { symbol: "XLV", name: "Health Care SPDR", type: "etf", role: "sector-defensive" },
  { symbol: "XLY", name: "Consumer Discretionary SPDR", type: "etf", role: "sector-cyclical" },
  { symbol: "XLK", name: "Technology SPDR", type: "etf", role: "sector-cyclical" },
  { symbol: "XLI", name: "Industrials SPDR", type: "etf", role: "sector-cyclical" },
  { symbol: "XLF", name: "Financials SPDR", type: "etf", role: "sector-cyclical" },
  { symbol: "XLE", name: "Energy SPDR", type: "etf", role: "sector-cyclical" },
  { symbol: "XLB", name: "Materials SPDR", type: "etf", role: "sector-cyclical" },
];

/**
 * Daily-bar retention for constituents (weekly bars keep full history).
 * Bounded to respect the Supabase free-tier 500 MB cap; indices and
 * intermarket instruments keep full daily history (small row counts).
 */
export const CONSTITUENT_DAILY_RETENTION_DAYS = 3 * 365;
