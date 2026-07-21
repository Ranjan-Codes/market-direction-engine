import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, upsertRows } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { forexFactoryProvider } from "../src/lib/providers/forexfactory";

/**
 * Economic calendar (this week + next week) from ForexFactory.
 * Consensus/previous only — the feed carries no actuals (flagged at gate).
 */
loadEnvLocal();

async function main(): Promise<void> {
  await withIngestionRun("ingest-calendar", "forexfactory", async () => {
    const { data, meta } = await forexFactoryProvider.getEvents("", "");
    const rows = data.map((e) => [
      e.country, e.eventName, e.releaseAt, e.importance ?? null,
      e.consensus ?? null, e.previous ?? null, e.unit ?? null,
      meta.source, meta.asOf,
    ]);
    const written = await upsertRows(
      "economic_events",
      ["country", "event_name", "release_at", "importance",
       "consensus", "previous", "unit", "source", "as_of"],
      ["source", "country", "event_name", "release_at"],
      rows,
    );
    console.log(`  ${data.length} US/UK events (this week + next)`);
    return { rowsWritten: written };
  });
}

main()
  .catch(() => process.exitCode = 1)
  .finally(() => closePool());
