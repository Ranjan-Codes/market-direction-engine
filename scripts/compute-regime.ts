import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool, upsertRows } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { loadRegimeContext, computeRegimeForWeek } from "../src/lib/compute/regime";
import { REGIME_WEIGHTS, GAUGE_WEIGHTS, WEIGHTS_VERSION } from "../src/config/weights";
import { weekEndFriday } from "../src/lib/utils/weeks";

/**
 * Compute the Market Regime Score + Reversal-Risk gauge per index, weekly.
 * Backfills every week where breadth history exists; catalysts attach to
 * the current week only (events table holds current/future events).
 */
loadEnvLocal();

async function main(): Promise<void> {
  await withIngestionRun("compute-regime", null, async () => {
    const pool = getPool();

    // Seed the weights version (traceability guardrail).
    await pool.query(
      `insert into weights_versions (version, weights, notes)
       values ($1, $2, 'seed: phase 3b regime engine')
       on conflict (version) do nothing`,
      [WEIGHTS_VERSION, JSON.stringify({ regime: REGIME_WEIGHTS, gauge: GAUGE_WEIGHTS })],
    );

    const { rows: indices } = await pool.query(`
      select i.id, i.symbol, coalesce(i.metadata->>'country','US') as country
        from instruments i
       where i.instrument_type = 'index' and i.is_active
         and exists (select 1 from breadth_metrics b where b.index_id = i.id)
       order by i.symbol`);

    const currentWeek = weekEndFriday(new Date().toISOString().slice(0, 10));
    let written = 0;
    for (const idx of indices) {
      const ctx = await loadRegimeContext(idx);
      // Weekly grid: Fridays covered by breadth history (skip 200d warmup).
      const dates = ctx.breadth.map((b) => b.metric_date);
      if (dates.length < 220) continue;
      const fridays = [...new Set(dates.slice(200).map((d) => weekEndFriday(d)))].sort();

      const rows: unknown[][] = [];
      let latest: Awaited<ReturnType<typeof computeRegimeForWeek>> = null;
      for (const friday of fridays) {
        const r = await computeRegimeForWeek(ctx, friday, friday === currentWeek);
        if (r) {
          rows.push(r.row);
          latest = r;
        }
      }
      written += await upsertRows(
        "regime_scores",
        ["index_id", "as_of_date", "trend_score", "breadth_score", "intermarket_score",
         "positioning_score", "narrative_score", "composite_score", "regime",
         "confidence", "weights_version", "breakdown"],
        ["index_id", "as_of_date", "weights_version"],
        rows,
      );
      if (latest) {
        console.log(
          `  ${idx.symbol}: ${rows.length} weeks | now ${latest.regime} (${latest.composite}) | gauge: ${latest.gauge.direction} ${latest.gauge.intensity}`,
        );
      }
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
