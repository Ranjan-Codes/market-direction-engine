import * as cheerio from "cheerio";
import { fetchWithRetry } from "../http";
import type { IndexConstituent, ProviderResult } from "../providers/types";

/**
 * Index constituents from Wikipedia's standardised `#constituents` wikitable
 * (present on the S&P 500, Nasdaq-100, and FTSE 100 pages — verified
 * 2026-07-21). Current membership only: Wikipedia is not point-in-time, so
 * membership history accrues from our own valid_from/valid_to tracking
 * starting at first ingestion (survivorship-bias limitation flagged at gate).
 *
 * Headlines-and-facts usage of Wikipedia content; attribution stored on the
 * membership rows via source='wikipedia'.
 */

/** Convert a raw ticker cell to a Yahoo symbol (BRK.B → BRK-B; + LSE suffix). */
export function toYahooSymbol(rawTicker: string, suffix: string): string {
  let t = rawTicker.trim().toUpperCase();
  // LSE tickers on Wikipedia sometimes carry a trailing dot (e.g. "BT.A.")
  t = t.replace(/\.+$/, "");
  if (suffix) {
    // UK: dots within tickers stay (BT.A → BT-A.L per Yahoo convention)
    t = t.replace(/\./g, "-");
    return `${t}${suffix}`;
  }
  // US: class shares use dashes on Yahoo (BRK.B → BRK-B)
  return t.replace(/\./g, "-");
}

function parseTable(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<never>,
  constituentSuffix: string,
): IndexConstituent[] {
  // Identify the ticker and name columns from the header row.
  const headers = table
    .find("tr")
    .first()
    .find("th")
    .map((_, th) => $(th).text().trim().toLowerCase())
    .get();
  const tickerCol = headers.findIndex((h) => /symbol|ticker|epic/.test(h));
  const nameCol = headers.findIndex((h) => /company|security|name/.test(h));
  const sectorCol = headers.findIndex((h) => /sector|industry/.test(h));
  if (tickerCol === -1) return [];

  const constituents: IndexConstituent[] = [];
  const seen = new Set<string>();
  table
    .find("tr")
    .slice(1)
    .each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length <= tickerCol) return;
      const raw = $(cells[tickerCol]).text().trim();
      // Tickers are short, uppercase-ish tokens; skip prose/date cells.
      if (!raw || raw.length > 12 || !/^[A-Za-z][A-Za-z0-9.\-]*$/.test(raw)) return;
      const symbol = toYahooSymbol(raw, constituentSuffix);
      if (seen.has(symbol)) return;
      seen.add(symbol);
      constituents.push({
        symbol,
        name: nameCol >= 0 ? $(cells[nameCol]).text().trim() : undefined,
        sector: sectorCol >= 0 ? $(cells[sectorCol]).text().trim() : undefined,
      });
    });
  return constituents;
}

export async function getWikipediaConstituents(
  page: string,
  constituentSuffix: string,
): Promise<ProviderResult<IndexConstituent[]>> {
  const res = await fetchWithRetry(`https://en.wikipedia.org/wiki/${page}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Prefer the standardised #constituents table (S&P 500, FTSE 100); some
  // pages (Nasdaq-100) don't use the id, so fall back to the largest
  // wikitable that has a ticker column.
  const explicit = $("table#constituents").first();
  let best: IndexConstituent[] = [];
  if (explicit.length > 0) {
    best = parseTable($, explicit as cheerio.Cheerio<never>, constituentSuffix);
  } else {
    $("table.wikitable").each((_, el) => {
      const parsed = parseTable($, $(el) as cheerio.Cheerio<never>, constituentSuffix);
      if (parsed.length > best.length) best = parsed;
    });
  }

  if (best.length < 50) {
    throw new Error(
      `Suspiciously few constituents (${best.length}) parsed from ${page} — page layout may have changed`,
    );
  }
  return {
    data: best,
    meta: { source: "wikipedia", asOf: new Date().toISOString() },
  };
}
