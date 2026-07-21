import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { computeIndexBreadth } from "../src/lib/compute/breadth";

/** Compute daily breadth metrics for every index that has constituents. */
loadEnvLocal();

async function main(): Promise<void> {
  await withIngestionRun("compute-breadth", null, async () => {
    const pool = getPool();
    const { rows: indices } = await pool.query(`
      select distinct i.id, i.symbol
        from instruments i join index_membership m on m.index_id = i.id
       order by i.symbol`);
    let written = 0;
    for (const idx of indices) {
      written += await computeIndexBreadth(idx.id, idx.symbol);
    }
    return { rowsWritten: written };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
