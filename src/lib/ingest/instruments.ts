import { getPool } from "../db";
import { INDICES, INTERMARKET_INSTRUMENTS, type IndexConfig } from "../../config/markets";
import { getWikipediaConstituents } from "../constituents/wikipedia";
import { getNasdaq100Constituents } from "../constituents/nasdaq";

/**
 * Universe seeding + point-in-time membership sync.
 *
 * Wikipedia gives CURRENT membership only, so we build our own history:
 * new names open a row (valid_from = today), departures close the open row
 * (valid_to = today). Point-in-time correctness therefore accrues from
 * first ingestion onward.
 */

async function upsertInstrument(
  symbol: string,
  name: string | null,
  type: string,
  currency: string | null,
  metadata: Record<string, unknown> = {},
): Promise<number> {
  const { rows } = await getPool().query(
    `insert into instruments (symbol, name, instrument_type, currency, metadata)
     values ($1, $2, $3, $4, $5)
     on conflict (symbol, exchange) do update
       set name = coalesce(excluded.name, instruments.name),
           metadata = instruments.metadata || excluded.metadata,
           is_active = true
     returning id`,
    [symbol, name, type, currency, JSON.stringify(metadata)],
  );
  return rows[0].id;
}

/** Seed the four index instruments + intermarket instruments. Returns index ids by key. */
export async function seedCoreInstruments(): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const idx of INDICES) {
    const id = await upsertInstrument(idx.key, idx.name, "index", idx.currency, {
      yahooSymbol: idx.yahooSymbol,
      country: idx.country,
    });
    ids.set(idx.key, id);
  }
  for (const aux of INTERMARKET_INSTRUMENTS) {
    await upsertInstrument(aux.symbol, aux.name, aux.type, null, {
      role: aux.role,
      intermarket: true,
    });
  }
  return ids;
}

export interface MembershipSyncResult {
  index: string;
  constituents: number;
  added: number;
  removed: number;
}

/** Sync one index's membership from Wikipedia against our open rows. */
export async function syncMembership(
  index: IndexConfig,
  indexId: number,
): Promise<MembershipSyncResult> {
  if (!index.constituentSource) {
    return { index: index.key, constituents: 0, added: 0, removed: 0 };
  }
  const pool = getPool();
  const { data, meta } =
    index.constituentSource === "nasdaq-api"
      ? await getNasdaq100Constituents()
      : await getWikipediaConstituents(index.wikipediaPage!, index.constituentSuffix);

  // Upsert constituent instruments.
  const symbolToId = new Map<string, number>();
  for (const c of data) {
    const id = await upsertInstrument(c.symbol, c.name ?? null, "equity", index.currency, {
      ...(c.sector ? { sector: c.sector } : {}),
      country: index.country,
    });
    symbolToId.set(c.symbol, id);
  }

  // Current open membership.
  const { rows: openRows } = await pool.query(
    `select m.id, m.constituent_id, i.symbol
       from index_membership m join instruments i on i.id = m.constituent_id
      where m.index_id = $1 and m.valid_to is null`,
    [indexId],
  );
  const openBySymbol = new Map<string, { id: number }>(
    openRows.map((r: { id: number; symbol: string }) => [r.symbol, { id: r.id }]),
  );

  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  let removed = 0;

  // Open rows for new names.
  for (const [symbol, constituentId] of symbolToId) {
    if (!openBySymbol.has(symbol)) {
      await pool.query(
        `insert into index_membership (index_id, constituent_id, valid_from, source, as_of)
         values ($1, $2, $3, $4, $5)
         on conflict (index_id, constituent_id, valid_from) do nothing`,
        [indexId, constituentId, today, meta.source, meta.asOf],
      );
      added++;
    }
  }
  // Close rows for departures.
  for (const [symbol, row] of openBySymbol) {
    if (!symbolToId.has(symbol)) {
      await pool.query(
        `update index_membership set valid_to = $2 where id = $1`,
        [row.id, today],
      );
      removed++;
    }
  }

  return { index: index.key, constituents: data.length, added, removed };
}
