import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool, upsertRows } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { getQuoteFacts } from "../src/lib/providers/yahoo-quote";
import { EARNINGS_CATALYSTS } from "../src/config/markets";

/**
 * Earnings-catalyst ingestion (north-star support): refresh market caps for
 * all constituents (index-weight proxy, stored in instruments.metadata),
 * then write upcoming earnings dates of each index's top-N names into
 * economic_events — the catalyst list every reversal-risk warning cites.
 * Importance: 'high' for the top `highImportanceTop` by cap, else 'medium'.
 */
loadEnvLocal();

interface MemberRow {
  index_key: string;
  country: string;
  instrument_id: number;
  symbol: string;
}

async function main(): Promise<void> {
  await withIngestionRun("ingest-earnings", "yahoo", async () => {
    const pool = getPool();
    const { rows: members }: { rows: MemberRow[] } = await pool.query(`
      select idx.symbol as index_key,
             coalesce(idx.metadata->>'country', 'US') as country,
             i.id as instrument_id, i.symbol
        from index_membership m
        join instruments idx on idx.id = m.index_id
        join instruments i on i.id = m.constituent_id
       where m.valid_to is null`);

    const uniqueSymbols = [...new Set(members.map((m) => m.symbol))];
    const facts = await getQuoteFacts(uniqueSymbols);
    const bySymbol = new Map(facts.map((f) => [f.symbol, f]));

    // Persist market caps (weight proxy) on the instruments.
    let capsUpdated = 0;
    for (const f of facts) {
      if (f.marketCap == null) continue;
      await pool.query(
        `update instruments
            set metadata = metadata || jsonb_build_object('marketCap', $2::numeric)
          where symbol = $1`,
        [f.symbol, f.marketCap],
      );
      capsUpdated++;
    }

    // Top-N per index by cap → earnings events.
    const asOf = new Date().toISOString();
    const eventRows: unknown[][] = [];
    const byIndex = new Map<string, MemberRow[]>();
    for (const m of members) {
      (byIndex.get(m.index_key) ?? byIndex.set(m.index_key, []).get(m.index_key)!).push(m);
    }
    const summary: Record<string, { top: number; withDates: number }> = {};
    for (const [indexKey, list] of byIndex) {
      const ranked = list
        .map((m) => ({ ...m, cap: bySymbol.get(m.symbol)?.marketCap ?? 0 }))
        .sort((a, b) => b.cap - a.cap)
        .slice(0, EARNINGS_CATALYSTS.topByCap);
      let withDates = 0;
      ranked.forEach((m, rank) => {
        const date = bySymbol.get(m.symbol)?.nextEarningsDate;
        if (!date || date < asOf) return; // future events only
        withDates++;
        eventRows.push([
          m.country,
          `Earnings: ${m.symbol}`,
          date,
          rank < EARNINGS_CATALYSTS.highImportanceTop ? "high" : "medium",
          null, null, null,
          "yahoo", asOf,
        ]);
      });
      summary[indexKey] = { top: ranked.length, withDates };
    }

    // Dual-listed names (SPX ∩ NDX) yield identical tuples — dedupe on the
    // conflict key, keeping the higher importance.
    const deduped = new Map<string, unknown[]>();
    for (const row of eventRows) {
      const key = `${row[0]}|${row[1]}|${row[2]}`;
      const existing = deduped.get(key);
      if (!existing || (existing[3] !== "high" && row[3] === "high")) {
        deduped.set(key, row);
      }
    }
    const written = await upsertRows(
      "economic_events",
      ["country", "event_name", "release_at", "importance",
       "consensus", "previous", "unit", "source", "as_of"],
      ["source", "country", "event_name", "release_at"],
      [...deduped.values()],
    );
    console.log(`  caps updated: ${capsUpdated}/${uniqueSymbols.length}`);
    for (const [k, v] of Object.entries(summary)) {
      console.log(`  ${k}: top ${v.top} by cap, ${v.withDates} with upcoming earnings dates`);
    }
    return { rowsWritten: written, detail: { capsUpdated, summary } };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
