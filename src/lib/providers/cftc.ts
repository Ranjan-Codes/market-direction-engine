import { fetchWithRetry } from "../http";
import type { ProviderResult } from "./types";

/**
 * CFTC Commitments of Traders via the public Socrata API (free, no key for
 * modest volumes). Legacy futures-only report; non-commercial net positioning
 * on index futures is the contrarian-at-extremes positioning input (Layer 1D).
 */

export interface CotReading {
  reportDate: string; // yyyy-mm-dd
  market: string;
  nonCommLong: number;
  nonCommShort: number;
  nonCommNet: number;
  openInterest: number;
}

/**
 * Maps our index keys to CFTC market name prefixes (legacy report).
 * Names changed over time — e.g. the NDX e-mini was "NASDAQ-100 STOCK
 * INDEX (MINI)" before becoming "NASDAQ MINI" — so each key lists every
 * historical prefix and results are merged.
 */
export const COT_MARKETS: Record<string, string[]> = {
  SPX: ["E-MINI S&P 500"],
  NDX: ["NASDAQ MINI", "NASDAQ-100 STOCK INDEX (MINI)"],
};

const BASE = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";

export async function getCotSeries(
  marketPrefix: string,
  fromDate: string,
): Promise<ProviderResult<CotReading[]>> {
  const where = encodeURIComponent(
    `starts_with(market_and_exchange_names, '${marketPrefix}') AND report_date_as_yyyy_mm_dd >= '${fromDate}'`,
  );
  const url = `${BASE}?$where=${where}&$order=report_date_as_yyyy_mm_dd&$limit=5000`;
  const res = await fetchWithRetry(url);
  const rows = (await res.json()) as Array<Record<string, string>>;
  const data: CotReading[] = rows.map((r) => {
    const long = Number(r.noncomm_positions_long_all);
    const short = Number(r.noncomm_positions_short_all);
    return {
      reportDate: r.report_date_as_yyyy_mm_dd.slice(0, 10),
      market: r.market_and_exchange_names,
      nonCommLong: long,
      nonCommShort: short,
      nonCommNet: long - short,
      openInterest: Number(r.open_interest_all),
    };
  });
  return { data, meta: { source: "cftc", asOf: new Date().toISOString() } };
}
