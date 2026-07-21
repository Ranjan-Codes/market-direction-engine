import { loadEnvLocal } from "../src/lib/load-env";
import { closePool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { runBacktest } from "../src/lib/backtest/run";

loadEnvLocal();

const pct = (v: number | null) => (v == null ? "   -  " : `${(v * 100).toFixed(2)}%`);
const num = (v: number | null) => (v == null ? "  -" : v.toFixed(2));

async function main(): Promise<void> {
  await withIngestionRun("run-backtest", null, async () => {
    const { runId, segments } = await runBacktest();
    console.log(`  run #${runId}`);
    console.log(
      "  segment".padEnd(42) +
        "n".padStart(6) + "hit".padStart(8) + "avg2w".padStart(9) +
        "avg4w".padStart(9) + "avg6w".padStart(9) + "expect".padStart(9) +
        "pf".padStart(6) + "maxDD".padStart(8),
    );
    for (const s of segments) {
      console.log(
        `  ${(s.segmentType + ":" + s.segmentKey).padEnd(40)}` +
          String(s.n).padStart(6) +
          (s.hitRate == null ? "     -" : `${(s.hitRate * 100).toFixed(0)}%`.padStart(8)) +
          pct(s.avg2w).padStart(9) + pct(s.avg4w).padStart(9) + pct(s.avg6w).padStart(9) +
          pct(s.expectancy).padStart(9) + num(s.profitFactor).padStart(6) +
          pct(s.maxDrawdown).padStart(8),
      );
    }
    return { rowsWritten: segments.length, detail: { runId } };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
