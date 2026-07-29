import { getPool, upsertRows } from "../db";
import { getChartBundle } from "../providers/yahoo";
import { rollupWeekly, adj } from "./rollup";
import { weekStartMonday } from "../utils/weeks";

/**
 * OHLCV ingestion for one instrument: raw + adjusted daily bars, weekly
 * rollups, and corporate actions — one provider request per instrument.
 *
 * Modes:
 * - backfill: full history from HISTORY_START; weekly bars stored for the
 *   whole range, daily bars only within the retention window (if set).
 * - incremental: refetch a 14-day overlap window ending today; weekly bars
 *   are only recomputed for weeks fully covered by the window (a partial
 *   window must never overwrite a settled weekly bar).
 */

// History depth is a free-tier tradeoff, not an analytical preference: 1990 put
// the DB at 89% of the 500 MB cap, 2000 at 99%. 2010 keeps ~16 years — enough
// for the 260-week indicator warmup plus a decade of backtest range, but it
// does NOT cover the dot-com bust or the GFC. Raising this and re-running the
// `backfill` job restores deeper history if the cap ever moves (Supabase Pro).
export const HISTORY_START = "2010-01-01";
const INCREMENTAL_OVERLAP_DAYS = 14;

export interface InstrumentRow {
  id: number;
  symbol: string;
  instrument_type: string;
  metadata: { yahooSymbol?: string } & Record<string, unknown>;
}

export interface OhlcvIngestResult {
  symbol: string;
  daily: number;
  weekly: number;
  actions: number;
  firstDate?: string;
  lastDate?: string;
}

export async function ingestInstrumentOhlcv(
  instrument: InstrumentRow,
  opts: {
    mode: "backfill" | "incremental";
    /** Keep daily bars only on/after this date; null = keep all. */
    dailyRetainFrom: string | null;
  },
): Promise<OhlcvIngestResult> {
  const pool = getPool();
  const yahooSymbol = instrument.metadata.yahooSymbol ?? instrument.symbol;

  let fetchFrom = HISTORY_START;
  if (opts.mode === "incremental") {
    const { rows } = await pool.query(
      `select max(trade_date)::text as last from ohlcv_daily where instrument_id = $1`,
      [instrument.id],
    );
    if (rows[0]?.last) {
      const d = new Date(`${rows[0].last}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - INCREMENTAL_OVERLAP_DAYS);
      fetchFrom = d.toISOString().slice(0, 10);
    }
  }
  const today = new Date().toISOString().slice(0, 10);

  const { data, meta } = await getChartBundle(yahooSymbol, fetchFrom, today);
  const { bars, actions } = data;
  if (bars.length === 0) {
    return { symbol: instrument.symbol, daily: 0, weekly: 0, actions: 0 };
  }

  // Daily rows (respect retention window).
  const dailyBars = opts.dailyRetainFrom
    ? bars.filter((b) => b.date >= opts.dailyRetainFrom!)
    : bars;
  // Only adjusted prices are stored — raw OHLC and adj_volume were dropped in
  // migration 00006 as write-only. `volume` is kept (technicals reads it).
  const daily = await upsertRows(
    "ohlcv_daily",
    [
      "instrument_id", "trade_date", "volume",
      "adj_open", "adj_high", "adj_low", "adj_close", "source", "as_of",
    ],
    ["instrument_id", "trade_date"],
    dailyBars.map((b) => [
      instrument.id, b.date, b.volume,
      adj(b.open, b), adj(b.high, b), adj(b.low, b), adj(b.close, b),
      meta.source, meta.asOf,
    ]),
  );

  // Weekly rollups. In incremental mode, only weeks whose Monday is inside
  // the fetched window are recomputed — never overwrite settled weeks with
  // partial data.
  let weeks = rollupWeekly(bars);
  if (opts.mode === "incremental") {
    weeks = weeks.filter((w) => weekStartMonday(w.weekEnd) >= fetchFrom);
  }
  const weekly = await upsertRows(
    "ohlcv_weekly",
    [
      "instrument_id", "week_end", "volume",
      "adj_open", "adj_high", "adj_low", "adj_close", "source", "as_of",
    ],
    ["instrument_id", "week_end"],
    weeks.map((w) => [
      instrument.id, w.weekEnd, w.volume,
      w.adjOpen, w.adjHigh, w.adjLow, w.adjClose, meta.source, meta.asOf,
    ]),
  );

  // Corporate actions.
  const actionsWritten = await upsertRows(
    "corporate_actions",
    [
      "instrument_id", "action_type", "ex_date",
      "split_numerator", "split_denominator", "dividend_amount", "source", "as_of",
    ],
    ["instrument_id", "action_type", "ex_date"],
    actions.map((a) => [
      instrument.id, a.type, a.exDate,
      a.splitNumerator ?? null, a.splitDenominator ?? null,
      a.dividendAmount ?? null, meta.source, meta.asOf,
    ]),
  );

  return {
    symbol: instrument.symbol,
    daily,
    weekly,
    actions: actionsWritten,
    firstDate: bars[0].date,
    lastDate: bars[bars.length - 1].date,
  };
}

/** All active instruments that should have OHLCV bars. */
export async function listPriceableInstruments(): Promise<InstrumentRow[]> {
  const { rows } = await getPool().query(
    `select id, symbol, instrument_type, metadata
       from instruments
      where is_active
        and instrument_type in ('index','equity','etf','future','currency')
      order by instrument_type, symbol`,
  );
  return rows;
}
