import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { getCotSeries, COT_MARKETS } from "../src/lib/providers/cftc";
import { sleep } from "../src/lib/http";

/**
 * Positioning ingestion (Layer 1D input): CFTC COT non-commercial net
 * positioning on index futures → sentiment_readings.
 * score = net non-commercial contracts (normalisation happens at regime
 * compute time); volume = open interest; raw row kept in detail.
 *
 * AAII (paywalled) and CBOE put/call (403 on CDN) are v1 gaps — flagged.
 */
loadEnvLocal();

async function main(): Promise<void> {
  await withIngestionRun("ingest-positioning", "cftc", async () => {
    const pool = getPool();
    let written = 0;
    for (const [indexKey, marketPrefixes] of Object.entries(COT_MARKETS)) {
      // Incremental: from last stored reading (minus 2 weeks), else 2006.
      const { rows } = await pool.query(
        `select max(reading_at)::text as last from sentiment_readings
          where source = 'cot' and scope_type = 'index' and scope_key = $1`,
        [indexKey],
      );
      let from = "2006-01-01";
      if (rows[0]?.last) {
        const d = new Date(rows[0].last);
        d.setUTCDate(d.getUTCDate() - 14);
        from = d.toISOString().slice(0, 10);
      }
      const results = await Promise.all(
        marketPrefixes.map((p) => getCotSeries(p, from)),
      );
      const meta = results[0].meta;
      const data = results
        .flatMap((r) => r.data)
        .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
      // sentiment_readings has no natural key — delete+insert the window instead.
      await pool.query(
        `delete from sentiment_readings
          where source = 'cot' and scope_type = 'index' and scope_key = $1
            and reading_at >= $2`,
        [indexKey, from],
      );
      for (const r of data) {
        await pool.query(
          `insert into sentiment_readings
             (scope_type, scope_key, source, reading_at, score, volume, detail, as_of)
           values ('index', $1, 'cot', $2, $3, $4, $5, $6)`,
          [
            indexKey, `${r.reportDate}T00:00:00Z`, r.nonCommNet, r.openInterest,
            JSON.stringify({ market: r.market, long: r.nonCommLong, short: r.nonCommShort }),
            meta.asOf,
          ],
        );
        written++;
      }
      console.log(`  COT ${indexKey}: ${data.length} reports from ${from}`);
      await sleep(1_000);
    }
    return { rowsWritten: written };
  });
}

main()
  .catch(() => process.exitCode = 1)
  .finally(() => closePool());
