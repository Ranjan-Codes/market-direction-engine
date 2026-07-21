import { fetchWithRetry } from "../http";
import type {
  CorporateAction,
  DailyBar,
  MarketDataProvider,
  ProviderResult,
} from "./types";
import { RATE_LIMITS } from "../../config/providers";

/**
 * Yahoo Finance chart API (unofficial, free). Primary OHLCV source —
 * verified 2026-07-21: full daily history, US + UK coverage, all four v1
 * indices, split/dividend events, and adjusted closes from one consistent
 * source. Unofficial ⇒ wrapped in retry + staleness detection per the brief.
 *
 * Notes:
 * - `range=max` silently degrades to monthly bars; explicit period1/period2
 *   epoch params are required for full daily history.
 * - LSE quotes arrive in pence (currency "GBp") — normalised to GBP here so
 *   everything downstream is in major units.
 */

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta: { currency?: string; symbol: string };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
        adjclose?: Array<{ adjclose: (number | null)[] }>;
      };
      events?: {
        splits?: Record<string, { date: number; numerator: number; denominator: number }>;
        dividends?: Record<string, { date: number; amount: number }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

/** A daily bar extended with the cumulative adjustment factor for that day. */
export interface AdjustedDailyBar extends DailyBar {
  /** adjclose / close — multiply raw prices by this to adjust. */
  adjFactor: number;
  currency: string;
}

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchChart(
  symbol: string,
  fromEpoch: number,
  toEpoch: number,
): Promise<YahooChartResponse["chart"]["result"]> {
  const url =
    `${BASE}/${encodeURIComponent(symbol)}` +
    `?period1=${fromEpoch}&period2=${toEpoch}&interval=1d&events=div%2Csplits`;
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": BROWSER_UA },
    retries: 3,
    backoffMs: 2_000,
  });
  const body = (await res.json()) as YahooChartResponse;
  if (body.chart.error) {
    throw new Error(
      `yahoo error for ${symbol}: ${body.chart.error.code} ${body.chart.error.description}`,
    );
  }
  return body.chart.result;
}

function toEpoch(isoDate: string): number {
  return Math.floor(new Date(`${isoDate}T00:00:00Z`).getTime() / 1000);
}

function epochToIso(epoch: number): string {
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}

export interface ChartBundle {
  bars: AdjustedDailyBar[];
  actions: CorporateAction[];
  currency: string;
}

/**
 * One request per symbol: raw daily bars with per-day adjustment factors,
 * split/dividend events, and currency normalisation.
 */
export async function getChartBundle(
  symbol: string,
  from: string,
  to: string,
): Promise<ProviderResult<ChartBundle>> {
  const result = await fetchChart(symbol, toEpoch(from), toEpoch(to) + 86_400);
  const r = result?.[0];
  const timestamps = r?.timestamp ?? [];
  const q = r?.indicators.quote[0];
  const adj = r?.indicators.adjclose?.[0]?.adjclose;
  // GBp = pence; convert to GBP so all prices are in major units.
  const pence = r?.meta.currency === "GBp";
  const scale = pence ? 0.01 : 1;
  const currency = pence ? "GBP" : (r?.meta.currency ?? "USD");

  const bars: AdjustedDailyBar[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < timestamps.length; i++) {
    const close = q?.close[i];
    if (close == null) continue; // non-trading rows Yahoo sometimes emits
    const date = epochToIso(timestamps[i]);
    if (seen.has(date)) continue; // duplicate last-bar rows during UK session
    seen.add(date);
    const adjClose = adj?.[i] ?? close;
    bars.push({
      date,
      open: scaled(q?.open[i], scale),
      high: scaled(q?.high[i], scale),
      low: scaled(q?.low[i], scale),
      close: close * scale,
      volume: q?.volume[i] ?? null,
      adjFactor: adjClose / close,
      currency,
    });
  }
  const actions: CorporateAction[] = [];
  const events = r?.events;
  for (const s of Object.values(events?.splits ?? {})) {
    actions.push({
      type: "split",
      exDate: epochToIso(s.date),
      splitNumerator: s.numerator,
      splitDenominator: s.denominator,
    });
  }
  for (const d of Object.values(events?.dividends ?? {})) {
    actions.push({
      type: "dividend",
      exDate: epochToIso(d.date),
      dividendAmount: pence ? d.amount * 0.01 : d.amount,
    });
  }
  actions.sort((a, b) => a.exDate.localeCompare(b.exDate));

  return {
    data: { bars, actions, currency },
    meta: { source: "yahoo", asOf: new Date().toISOString() },
    stale: bars.length === 0,
  };
}

function scaled(v: number | null | undefined, scale: number): number | null {
  return v == null ? null : v * scale;
}

export const yahooProvider: MarketDataProvider = {
  name: "yahoo",
  capabilities: {
    dailyOhlcv: true,
    corporateActions: true,
    constituents: false,
    usEquities: true,
    ukEquities: true,
    indices: true,
  },
  rateLimit: RATE_LIMITS.yahoo,
  async getDailyBars(symbol, from, to) {
    const r = await getChartBundle(symbol, from, to);
    return {
      data: r.data.bars.map(({ adjFactor: _f, currency: _c, ...bar }) => bar as DailyBar),
      meta: r.meta,
      stale: r.stale,
    };
  },
  async getCorporateActions(symbol, from, to) {
    const r = await getChartBundle(symbol, from, to);
    return { data: r.data.actions, meta: r.meta };
  },
};
