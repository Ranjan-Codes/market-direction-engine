/**
 * Narrative/sentiment source configuration (Phase 3). Headlines + metadata
 * only — never article bodies (licensing guardrail). All verified live
 * 2026-07-21 unless noted.
 */

export interface RssFeedConfig {
  key: string;
  url: string;
  /** Which market's narrative this feed mostly speaks to. */
  country: "US" | "UK" | "GLOBAL";
  /** Central-bank/official feeds get a policy tag in detail. */
  official?: boolean;
}

export const RSS_FEEDS: RssFeedConfig[] = [
  { key: "cnbc-markets", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258", country: "US" },
  { key: "marketwatch-top", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", country: "US" },
  { key: "bbc-business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", country: "UK" },
  { key: "calculated-risk", url: "https://feeds.feedburner.com/CalculatedRisk", country: "US" },
  { key: "fed-press", url: "https://www.federalreserve.gov/feeds/press_all.xml", country: "US", official: true },
  { key: "boe-news", url: "https://www.bankofengland.co.uk/rss/news", country: "UK", official: true },
];

/** Keyword → macro-theme tagging applied to headline + summary (lowercased). */
export const THEME_KEYWORDS: Record<string, string[]> = {
  inflation: ["inflation", "cpi", "ppi", "price rises", "price growth", "deflation", "disinflation"],
  rates: ["fed", "fomc", "interest rate", "rate cut", "rate hike", "bank of england", "boe", "yield", "treasury", "gilt", "monetary policy"],
  growth: ["gdp", "recession", "pmi", "manufacturing", "retail sales", "economic growth", "slowdown", "soft landing"],
  employment: ["jobs report", "payroll", "unemployment", "jobless", "labor market", "labour market", "hiring"],
  earnings: ["earnings", "profit", "guidance", "quarterly results", "revenue beat", "revenue miss"],
  energy: ["oil", "crude", "opec", "natural gas", "energy prices"],
};

/** GDELT timeline-tone queries: theme × market. ~12 calls, 6.5s apart. */
export const GDELT_QUERIES: Array<{ scopeKey: string; query: string }> = [
  { scopeKey: "US:inflation", query: '(inflation OR CPI) sourcecountry:US' },
  { scopeKey: "US:rates", query: '("federal reserve" OR FOMC) sourcecountry:US' },
  { scopeKey: "US:growth", query: '(recession OR "economic growth" OR GDP) sourcecountry:US' },
  { scopeKey: "US:employment", query: '(payrolls OR unemployment OR "jobs report") sourcecountry:US' },
  { scopeKey: "US:markets", query: '("stock market" OR "S&P 500" OR Wall Street) sourcecountry:US' },
  { scopeKey: "UK:inflation", query: '(inflation OR CPI) sourcecountry:UK' },
  { scopeKey: "UK:rates", query: '("bank of england" OR "interest rates") sourcecountry:UK' },
  { scopeKey: "UK:growth", query: '(recession OR GDP OR economy) sourcecountry:UK' },
  { scopeKey: "UK:markets", query: '("FTSE" OR "stock market") sourcecountry:UK' },
];

/**
 * StockTwits watch symbols: index proxies. Top-10 US mega-caps are added at
 * runtime from instruments.metadata.marketCap. Blocked from this dev machine
 * (Cloudflare) — verified only from GitHub runners; skips gracefully.
 */
export const STOCKTWITS_INDEX_PROXIES = ["SPY", "QQQ"];

/** Reddit subs (needs REDDIT_CLIENT_ID/SECRET; skipped when absent). WSB is a
 *  contrarian froth gauge, not signal. */
export const REDDIT_SUBS = ["investing", "stocks", "wallstreetbets", "UKInvestments"];
