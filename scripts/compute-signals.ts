import { loadEnvLocal } from "../src/lib/load-env";
import { closePool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { computeSignals } from "../src/lib/compute/signals";

/** Layer-3 signal synthesis over the latest weekly snapshots. */
loadEnvLocal();

async function main(): Promise<void> {
  await withIngestionRun("compute-signals", null, async () => {
    const r = await computeSignals();
    console.log(
      `  ${r.written} signals | actionable ${r.actionable} | gated ${r.gated} | blackout ${r.blackout}`,
    );
    console.log("  top by conviction:");
    for (const s of r.sample.slice(0, 12)) {
      console.log(
        `    ${String(s.symbol).padEnd(10)} ${s.index ?? "-"}  ${s.direction}  conv ${s.conviction}  comp ${s.composite}${s.gated ? "  [GATED]" : ""}${s.blackout ? "  [BLACKOUT]" : ""}`,
      );
    }
    return { rowsWritten: r.written, detail: { actionable: r.actionable, gated: r.gated, blackout: r.blackout } };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
