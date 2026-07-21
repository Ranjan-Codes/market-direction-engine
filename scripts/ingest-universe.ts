import { loadEnvLocal } from "../src/lib/load-env";
import { closePool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { seedCoreInstruments, syncMembership } from "../src/lib/ingest/instruments";
import { INDICES } from "../src/config/markets";
import { sleep } from "../src/lib/http";

/**
 * Seed indices + intermarket instruments, then sync index membership from
 * Wikipedia (opens/closes point-in-time membership rows).
 */
async function main(): Promise<void> {
  loadEnvLocal();
  await withIngestionRun("ingest-universe", "wikipedia", async () => {
    const indexIds = await seedCoreInstruments();
    const results = [];
    for (const index of INDICES) {
      const id = indexIds.get(index.key)!;
      const r = await syncMembership(index, id);
      results.push(r);
      console.log(
        `  ${r.index}: ${r.constituents} constituents (+${r.added} / -${r.removed})`,
      );
      await sleep(1_000);
    }
    return {
      rowsWritten: results.reduce((s, r) => s + r.constituents, 0),
      detail: { results },
    };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
