import { loadEnvLocal } from "../src/lib/load-env";
import { closePool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import {
  computeInstrumentTechnicals,
  listTechnicalsTargets,
  loadIndexCloses,
} from "../src/lib/compute/technicals";

/**
 * Compute Layer-2 weekly technical snapshots for the whole universe.
 *   --symbols A,B   restrict (testing)
 */
loadEnvLocal();

const args = process.argv.slice(2);
const symbolsArg = args.find((a) => a.startsWith("--symbols="));
const onlySymbols = symbolsArg
  ? new Set(symbolsArg.slice("--symbols=".length).split(","))
  : null;

async function main(): Promise<void> {
  await withIngestionRun("compute-technicals", null, async () => {
    let targets = await listTechnicalsTargets();
    if (onlySymbols) targets = targets.filter((t) => onlySymbols.has(t.symbol));

    // Preload index close maps once.
    const indexCloses = new Map<string, Map<string, number>>();
    for (const key of new Set(targets.map((t) => t.rsIndexKey).filter(Boolean))) {
      indexCloses.set(key as string, await loadIndexCloses(key as string));
    }

    let snapshots = 0;
    const failures: Array<{ symbol: string; error: string }> = [];
    let done = 0;
    for (const t of targets) {
      try {
        const r = await computeInstrumentTechnicals(
          { id: t.id, symbol: t.symbol },
          t.rsIndexKey ? (indexCloses.get(t.rsIndexKey) ?? null) : null,
        );
        snapshots += r.snapshots;
      } catch (err) {
        failures.push({
          symbol: t.symbol,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${targets.length} instruments`);
    }

    if (failures.length > 0) {
      console.warn(`  failures (${failures.length}):`);
      for (const f of failures.slice(0, 20)) console.warn(`    ${f.symbol}: ${f.error}`);
      if (failures.length / targets.length > 0.05) {
        throw new Error(`${failures.length}/${targets.length} instruments failed`);
      }
    }
    return {
      rowsWritten: snapshots,
      detail: { instruments: targets.length, failures },
    };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
