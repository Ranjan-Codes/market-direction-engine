import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { fetchWithRetry, sleep } from "../src/lib/http";
import { GDELT_QUERIES } from "../src/config/feeds";

/**
 * GDELT news-tone time series per theme × market → sentiment_readings
 * (source 'gdelt', scope_type 'theme'). Tone is GDELT's average document
 * tone (-100..+100 in principle, typically -10..+10). Strictly rate-limited
 * to one request per 6.5s (GDELT asks for ≥5s).
 */
loadEnvLocal();

interface GdeltTimeline {
  timeline?: Array<{ data?: Array<{ date: string; value: number }> }>;
}

async function main(): Promise<void> {
  await withIngestionRun("ingest-gdelt", "gdelt", async () => {
    const pool = getPool();
    let written = 0;
    for (const q of GDELT_QUERIES) {
      const url =
        "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
        encodeURIComponent(q.query) +
        "&mode=timelinetone&timespan=2w&format=json";
      const res = await fetchWithRetry(url, { retries: 2, backoffMs: 7_000 });
      const body = (await res.json()) as GdeltTimeline;
      const points = body.timeline?.[0]?.data ?? [];

      // Refresh the window: delete + insert per scope.
      const days = points
        .map((p) => ({ day: p.date.slice(0, 8), value: p.value }))
        .filter((p) => /^\d{8}$/.test(p.day))
        .map((p) => ({
          at: `${p.day.slice(0, 4)}-${p.day.slice(4, 6)}-${p.day.slice(6, 8)}T00:00:00Z`,
          value: p.value,
        }));
      if (days.length > 0) {
        await pool.query(
          `delete from sentiment_readings
            where source = 'gdelt' and scope_type = 'theme' and scope_key = $1
              and reading_at >= $2`,
          [q.scopeKey, days[0].at],
        );
        for (const d of days) {
          await pool.query(
            `insert into sentiment_readings
               (scope_type, scope_key, source, reading_at, score, detail, as_of)
             values ('theme', $1, 'gdelt', $2, $3, $4, now())`,
            [q.scopeKey, d.at, d.value, JSON.stringify({ query: q.query })],
          );
          written++;
        }
      }
      console.log(`  ${q.scopeKey}: ${days.length} tone points`);
      await sleep(6_500);
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
