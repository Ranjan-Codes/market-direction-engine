/**
 * v1 market universe. Add DAX, Nikkei, etc. here later — nothing else
 * should hardcode index membership.
 *
 * `symbols` maps provider-specific tickers; filled per provider in Phase 1.
 */
export interface IndexConfig {
  /** Our canonical key, used as instruments.symbol for the index. */
  key: string;
  name: string;
  country: "US" | "UK";
  currency: "USD" | "GBP";
  /** Provider-specific symbol overrides, e.g. { stooq: "^spx" }. */
  symbols: Record<string, string>;
}

export const INDICES: IndexConfig[] = [
  { key: "SPX",  name: "S&P 500",        country: "US", currency: "USD", symbols: {} },
  { key: "NDX",  name: "Nasdaq 100",     country: "US", currency: "USD", symbols: {} },
  { key: "NYA",  name: "NYSE Composite", country: "US", currency: "USD", symbols: {} },
  { key: "UKX",  name: "FTSE 100",       country: "UK", currency: "GBP", symbols: {} },
];
