import { fetchWithRetry } from "../http";
import type { IndexConstituent, ProviderResult } from "../providers/types";

/**
 * Nasdaq-100 membership from Nasdaq's own quote API (free, browser UA
 * required). Wikipedia removed the components table from the Nasdaq-100
 * article (verified 2026-07-21), so the exchange's list is the source.
 */

interface NasdaqListResponse {
  data?: { data?: { rows?: Array<{ symbol: string; companyName: string; sector?: string }> } };
  status?: { rCode?: number };
}

export async function getNasdaq100Constituents(): Promise<
  ProviderResult<IndexConstituent[]>
> {
  const res = await fetchWithRetry(
    "https://api.nasdaq.com/api/quote/list-type/nasdaq100",
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "application/json",
      },
    },
  );
  const body = (await res.json()) as NasdaqListResponse;
  const rows = body.data?.data?.rows ?? [];
  const data: IndexConstituent[] = rows.map((r) => ({
    symbol: r.symbol.trim().toUpperCase().replace(/\./g, "-"),
    name: r.companyName
      .replace(/ (Common|Class [A-C]( Common)?) (Stock|Shares?)$/i, "")
      .trim(),
    sector: r.sector || undefined,
  }));
  if (data.length < 90) {
    throw new Error(
      `Suspiciously few Nasdaq-100 constituents (${data.length}) — API shape may have changed`,
    );
  }
  return {
    data,
    meta: { source: "nasdaq-api", asOf: new Date().toISOString() },
  };
}
