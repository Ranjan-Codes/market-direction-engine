import { fetchWithRetry } from "../http";
import type { MacroDataProvider, MacroObservation, ProviderResult } from "./types";
import { RATE_LIMITS } from "../../config/providers";

/**
 * FRED (Federal Reserve Economic Data) — free with API key.
 * Supports vintage dates natively; we request realtime_start=realtime_end=today
 * so each ingestion stores the vintage as of ingestion time, and revisions
 * arrive as new rows in macro_observations (look-ahead guard).
 */

interface FredResponse {
  observations?: Array<{ date: string; value: string }>;
  error_code?: number;
  error_message?: string;
}

async function getSeries(
  fredId: string,
  from?: string,
  to?: string,
): Promise<ProviderResult<MacroObservation[]>> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY is not set");
  const params = new URLSearchParams({
    series_id: fredId,
    api_key: key,
    file_type: "json",
    ...(from ? { observation_start: from } : {}),
    ...(to ? { observation_end: to } : {}),
  });
  const res = await fetchWithRetry(
    `https://api.stlouisfed.org/fred/series/observations?${params}`,
  );
  const body = (await res.json()) as FredResponse;
  if (body.error_code) {
    throw new Error(`fred error for ${fredId}: ${body.error_message}`);
  }
  const data: MacroObservation[] = (body.observations ?? []).map((o) => ({
    obsDate: o.date,
    value: o.value === "." ? null : Number(o.value),
  }));
  return { data, meta: { source: "fred", asOf: new Date().toISOString() } };
}

export const fredProvider: MacroDataProvider = {
  name: "fred",
  rateLimit: RATE_LIMITS.fred,
  getSeries,
};
