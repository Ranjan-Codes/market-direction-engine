/**
 * Provider abstraction — app code NEVER calls a vendor SDK/API directly.
 * Every vendor is wrapped in one of these interfaces so a source can be
 * swapped (free → paid, or primary → fallback) without touching app code.
 *
 * All results carry ProviderMeta so `source` / `as_of` reach the database
 * on every datapoint.
 */

export interface ProviderMeta {
  /** Provider identifier, e.g. "stooq", "yfinance", "fred". */
  source: string;
  /** Vendor-effective timestamp of the data (ISO 8601). */
  asOf: string;
}

export interface ProviderResult<T> {
  data: T;
  meta: ProviderMeta;
  /** True when the provider signalled the data may be out of date. */
  stale?: boolean;
  warnings?: string[];
}

/** Declared per provider in config — enforced by the ingestion scheduler. */
export interface RateLimit {
  requestsPerMinute?: number;
  requestsPerDay?: number;
  /** Minimum spacing between calls, for very tight free tiers. */
  minIntervalMs?: number;
}

// ── Market data (OHLCV, corporate actions, constituents) ─────────────────────

export interface DailyBar {
  /** Trade date, ISO yyyy-mm-dd. */
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export type CorporateActionType = "split" | "dividend";

export interface CorporateAction {
  type: CorporateActionType;
  exDate: string;
  /** Splits: 4-for-1 → numerator 4, denominator 1. */
  splitNumerator?: number;
  splitDenominator?: number;
  dividendAmount?: number;
  currency?: string;
}

export interface IndexConstituent {
  symbol: string;
  name?: string;
  /** GICS/ICB sector when the source provides it — feeds defensive/cyclical reads. */
  sector?: string;
  weight?: number;
  /** ISO date the membership record is valid from, when the source is point-in-time. */
  validFrom?: string;
}

export interface MarketDataCapabilities {
  dailyOhlcv: boolean;
  corporateActions: boolean;
  constituents: boolean;
  /** Coverage flags used by the router when picking a provider per symbol. */
  usEquities: boolean;
  ukEquities: boolean;
  indices: boolean;
}

export interface MarketDataProvider {
  readonly name: string;
  readonly capabilities: MarketDataCapabilities;
  readonly rateLimit: RateLimit;
  getDailyBars(
    symbol: string,
    from: string,
    to: string,
  ): Promise<ProviderResult<DailyBar[]>>;
  getCorporateActions?(
    symbol: string,
    from: string,
    to: string,
  ): Promise<ProviderResult<CorporateAction[]>>;
  getConstituents?(indexSymbol: string): Promise<ProviderResult<IndexConstituent[]>>;
}

// ── Macro / economic series ──────────────────────────────────────────────────

export interface MacroObservation {
  obsDate: string;
  value: number | null;
}

export interface MacroDataProvider {
  readonly name: string;
  readonly rateLimit: RateLimit;
  getSeries(
    seriesCode: string,
    from?: string,
    to?: string,
  ): Promise<ProviderResult<MacroObservation[]>>;
}

// ── Economic calendar ────────────────────────────────────────────────────────

export interface EconomicEvent {
  country: string;
  eventName: string;
  releaseAt: string;
  period?: string;
  importance?: "low" | "medium" | "high";
  consensus?: number | null;
  previous?: number | null;
  actual?: number | null;
  unit?: string;
}

export interface EconomicCalendarProvider {
  readonly name: string;
  readonly rateLimit: RateLimit;
  getEvents(from: string, to: string): Promise<ProviderResult<EconomicEvent[]>>;
}

// ── Sentiment feeds (headlines/metadata only — never article bodies) ────────

export interface SentimentItem {
  /** Headline or message text — metadata only, per licensing guardrail. */
  text: string;
  url?: string;
  publishedAt: string;
  /** Tickers/indices/themes the source attributes the item to, if any. */
  entities?: string[];
  /** Pre-scored sentiment when the source provides one (-1..+1). */
  providerScore?: number;
}

export interface SentimentFeedProvider {
  readonly name: string;
  readonly rateLimit: RateLimit;
  fetchItems(since: string): Promise<ProviderResult<SentimentItem[]>>;
}
