import { fetchWithRetry } from "../http";
import type { EconomicCalendarProvider, EconomicEvent, ProviderResult } from "./types";

/**
 * ForexFactory weekly calendar JSON (free, no key). Provides consensus and
 * previous but NOT actuals — actual-vs-consensus surprise tracking needs a
 * second source or manual backfill (flagged at the Phase 1 gate).
 * Countries arrive as currency codes (USD, GBP); we ingest USD + GBP only.
 */

interface FfEvent {
  title: string;
  country: string; // currency code
  date: string; // ISO with offset
  impact: "High" | "Medium" | "Low" | "Holiday" | string;
  forecast: string;
  previous: string;
}

// Only the this-week feed exists (nextweek 404s, verified 2026-07-21).
// Events accumulate in economic_events across daily runs, so the forward
// visibility for blackout windows is up to ~7 days — flagged at gate.
const FEEDS = ["https://nfs.faireconomy.media/ff_calendar_thisweek.json"];

const COUNTRY_MAP: Record<string, string> = { USD: "US", GBP: "UK" };

/**
 * Parse ForexFactory numeric strings like "3.4%", "250M", "-0.2%", "185K"
 * into { value, unit }. Returns nulls for empty/non-numeric input.
 */
export function parseCalendarValue(raw: string): {
  value: number | null;
  unit: string | null;
} {
  const s = (raw ?? "").trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)(%|[KMBT])?$/i);
  if (!m) return { value: null, unit: null };
  return { value: Number(m[1]), unit: m[2]?.toUpperCase() ?? null };
}

async function getEvents(
  _from: string,
  _to: string,
): Promise<ProviderResult<EconomicEvent[]>> {
  const events: EconomicEvent[] = [];
  for (const feed of FEEDS) {
    const res = await fetchWithRetry(feed);
    const body = (await res.json()) as FfEvent[];
    for (const e of body) {
      const country = COUNTRY_MAP[e.country];
      if (!country) continue;
      if (e.impact === "Holiday") continue;
      const consensus = parseCalendarValue(e.forecast);
      const previous = parseCalendarValue(e.previous);
      events.push({
        country,
        eventName: e.title,
        releaseAt: new Date(e.date).toISOString(),
        importance:
          e.impact === "High" ? "high" : e.impact === "Medium" ? "medium" : "low",
        consensus: consensus.value,
        previous: previous.value,
        unit: consensus.unit ?? previous.unit ?? undefined,
      });
    }
  }
  return {
    data: events,
    meta: { source: "forexfactory", asOf: new Date().toISOString() },
  };
}

export const forexFactoryProvider: EconomicCalendarProvider = {
  name: "forexfactory",
  rateLimit: { minIntervalMs: 5_000 },
  getEvents,
};
