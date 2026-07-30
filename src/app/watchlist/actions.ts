"use server";

import { revalidatePath } from "next/cache";
import { getPool } from "../../lib/db";
import { searchSymbols } from "../../lib/providers/yahoo-quote";
import { ingestInstrumentOhlcv } from "../../lib/ingest/ohlcv";
import { computeInstrumentTechnicals, loadIndexCloses } from "../../lib/compute/technicals";
import { CONSTITUENT_DAILY_RETENTION_DAYS } from "../../config/markets";
import {
  getIGPositions,
  getIGWatchlists,
  getIGWatchlistItems,
  type IGWatchlistSummary,
} from "../../lib/providers/ig";

export async function toggleWatchlist(symbol: string): Promise<{ inList: boolean }> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select i.id, w.id as item_id
       from instruments i
       left join watchlist_items w on w.instrument_id = i.id
      where i.symbol = $1`,
    [symbol],
  );
  if (rows.length === 0) return { inList: false };
  let inList: boolean;
  if (rows[0].item_id != null) {
    await pool.query(`delete from watchlist_items where id = $1`, [rows[0].item_id]);
    inList = false;
  } else {
    await pool.query(
      `insert into watchlist_items (instrument_id) values ($1) on conflict do nothing`,
      [rows[0].id],
    );
    inList = true;
  }
  revalidatePath("/watchlist");
  revalidatePath("/screener");
  return { inList };
}

export interface StockMatch {
  symbol: string;
  name: string | null;
  source: "universe" | "yahoo";
  detail: string; // index key or exchange name
}

/** Search the local universe first, then all Yahoo-covered exchanges. */
export async function searchStocks(query: string): Promise<StockMatch[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const pool = getPool();
  const { rows: local } = await pool.query(
    `select i.symbol, i.name,
            coalesce((select ix.symbol from index_membership m
                        join instruments ix on ix.id = m.index_id
                       where m.constituent_id = i.id and m.valid_to is null
                       order by case ix.symbol when 'SPX' then 1 when 'NDX' then 2 else 3 end
                       limit 1), 'watch-only') as detail
       from instruments i
      where i.instrument_type = 'equity' and i.is_active
        and (upper(i.symbol) like upper($1) || '%' or i.name ilike '%' || $1 || '%')
      order by i.symbol limit 6`,
    [q],
  );
  const localSymbols = new Set(local.map((r: { symbol: string }) => r.symbol));
  const out: StockMatch[] = local.map((r: { symbol: string; name: string | null; detail: string }) => ({
    symbol: r.symbol,
    name: r.name,
    source: "universe" as const,
    detail: r.detail,
  }));
  if (q.length >= 2) {
    try {
      const remote = await searchSymbols(q);
      for (const hit of remote) {
        if (localSymbols.has(hit.symbol)) continue;
        out.push({ symbol: hit.symbol, name: hit.name, source: "yahoo", detail: hit.exchange });
        if (out.length >= 10) break;
      }
    } catch {
      // Yahoo search unreachable → local results only; the UI still works.
    }
  }
  return out;
}

/**
 * Add a stock to the watchlist. Stocks outside the stored universe are
 * onboarded in place: instrument row, full price history backfill, weekly
 * technicals — so the verdict appears immediately. The nightly pipeline
 * maintains it from then on. (Its per-stock signal row appears with the
 * next daily compute; verdicts don't depend on it.)
 */
export async function addStock(
  symbol: string,
): Promise<{ ok: boolean; error?: string }> {
  const pool = getPool();
  const { rows: existing } = await pool.query(
    `select id from instruments where symbol = $1`,
    [symbol],
  );
  let instrumentId: number;
  let created = false;

  if (existing.length > 0) {
    instrumentId = existing[0].id;
  } else {
    // Resolve the name via Yahoo search so the row is presentable.
    let name: string | null = null;
    try {
      const hits = await searchSymbols(symbol);
      name = hits.find((h) => h.symbol === symbol)?.name ?? null;
    } catch {
      /* name stays null */
    }
    const { rows: inserted } = await pool.query(
      `insert into instruments (symbol, name, instrument_type, metadata)
       values ($1, $2, 'equity', $3) returning id`,
      [symbol, name, JSON.stringify({ external: true, yahooSymbol: symbol })],
    );
    instrumentId = inserted[0].id;
    created = true;

    try {
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - CONSTITUENT_DAILY_RETENTION_DAYS);
      const r = await ingestInstrumentOhlcv(
        { id: instrumentId, symbol, instrument_type: "equity", metadata: { yahooSymbol: symbol } },
        { mode: "backfill", dailyRetainFrom: cutoff.toISOString().slice(0, 10) },
      );
      if (r.weekly === 0) throw new Error("no price history returned");

      // Mansfield RS benchmark fallback for off-index names: UK → UKX, US → SPX.
      const rsKey = symbol.endsWith(".L") ? "UKX" : symbol.includes(".") ? null : "SPX";
      const indexCloses = rsKey ? await loadIndexCloses(rsKey) : null;
      await computeInstrumentTechnicals({ id: instrumentId, symbol }, indexCloses);
    } catch (err) {
      // Roll the orphan back so a typo doesn't leave a dead instrument.
      await pool.query(`delete from technical_snapshots where instrument_id = $1`, [instrumentId]);
      await pool.query(`delete from ohlcv_daily where instrument_id = $1`, [instrumentId]);
      await pool.query(`delete from ohlcv_weekly where instrument_id = $1`, [instrumentId]);
      await pool.query(`delete from corporate_actions where instrument_id = $1`, [instrumentId]);
      await pool.query(`delete from instruments where id = $1`, [instrumentId]);
      return {
        ok: false,
        error: `Could not fetch price history for ${symbol}: ${err instanceof Error ? err.message : err}`,
      };
    }
  }

  await pool.query(
    `insert into watchlist_items (instrument_id) values ($1) on conflict do nothing`,
    [instrumentId],
  );
  revalidatePath("/watchlist");
  if (!created) revalidatePath("/screener");
  return { ok: true };
}

/* ── IG broker integration ───────────────────────────────────────────── */

export interface IGStockItem {
  symbol: string;
  name: string;
  source: "positions" | "watchlist";
}

export async function fetchIGPositions(): Promise<IGStockItem[]> {
  const positions = await getIGPositions();
  return positions
    .filter((p) => p.yahooSymbol != null)
    .map((p) => ({
      symbol: p.yahooSymbol!,
      name: p.instrumentName,
      source: "positions" as const,
    }));
}

export async function fetchIGWatchlistList(): Promise<IGWatchlistSummary[]> {
  return getIGWatchlists();
}

export async function fetchIGWatchlistStocks(watchlistId: string): Promise<IGStockItem[]> {
  const items = await getIGWatchlistItems(watchlistId);
  return items
    .filter((i) => i.yahooSymbol != null)
    .map((i) => ({
      symbol: i.yahooSymbol!,
      name: i.instrumentName,
      source: "watchlist" as const,
    }));
}
