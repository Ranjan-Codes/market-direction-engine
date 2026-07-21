import { loadEnvLocal } from "../src/lib/load-env";
import { closePool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import {
  ingestInstrumentOhlcv,
  listPriceableInstruments,
} from "../src/lib/ingest/ohlcv";
import { CONSTITUENT_DAILY_RETENTION_DAYS } from "../src/config/markets";
import { RATE_LIMITS } from "../src/config/providers";
import { sleep } from "../src/lib/http";

/**
 * OHLCV ingestion over the whole universe.
 *   --backfill        full history (first run / recovery); default incremental
 *   --symbols A,B     restrict to specific symbols (testing)
 *   --limit N         cap instrument count (testing)
 */
loadEnvLocal();

const args = process.argv.slice(2);
const mode = args.includes("--backfill") ? "backfill" : "incremental";
// slice past the first '=' only — symbols like GC=F contain '=' themselves
const symbolsArg = args.find((a) => a.startsWith("--symbols="));
const onlySymbols = symbolsArg
  ? new Set(symbolsArg.slice("--symbols=".length).split(","))
  : null;
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;

const retainCutoff = new Date();
retainCutoff.setUTCDate(retainCutoff.getUTCDate() - CONSTITUENT_DAILY_RETENTION_DAYS);
const dailyRetainFrom = retainCutoff.toISOString().slice(0, 10);
const pauseMs = RATE_LIMITS.yahoo.minIntervalMs ?? 400;

async function main(): Promise<void> {
  await withIngestionRun(`ingest-ohlcv-${mode}`, "yahoo", async () => {
    let instruments = await listPriceableInstruments();
    if (onlySymbols) instruments = instruments.filter((i) => onlySymbols.has(i.symbol));
    instruments = instruments.slice(0, limit);

    let daily = 0;
    let weekly = 0;
    const failures: Array<{ symbol: string; error: string }> = [];
    let done = 0;
    for (const inst of instruments) {
      try {
        // Equities keep a bounded daily window; indices/intermarket keep all.
        const r = await ingestInstrumentOhlcv(inst, {
          mode,
          dailyRetainFrom: inst.instrument_type === "equity" ? dailyRetainFrom : null,
        });
        daily += r.daily;
        weekly += r.weekly;
      } catch (err) {
        failures.push({
          symbol: inst.symbol,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      done++;
      if (done % 50 === 0) {
        console.log(`  ${done}/${instruments.length} instruments (${failures.length} failures)`);
      }
      await sleep(pauseMs);
    }

    if (failures.length > 0) {
      console.warn(`  failures (${failures.length}):`);
      for (const f of failures.slice(0, 20)) console.warn(`    ${f.symbol}: ${f.error}`);
    }
    // >5% failures = treat the run as broken rather than silently partial.
    if (instruments.length > 0 && failures.length / instruments.length > 0.05) {
      throw new Error(
        `${failures.length}/${instruments.length} instruments failed — provider likely degraded`,
      );
    }
    return {
      rowsWritten: daily + weekly,
      detail: { mode, instruments: instruments.length, daily, weekly, failures },
    };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
