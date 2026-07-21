import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";

/**
 * Build daily aggregate sentiment series from scored item rows:
 * - market tone per country (rss+reddit FinBERT average, volume)
 * - theme tone per country:theme (from tagged headlines)
 * - retail froth per country (reddit volume + one-sidedness of scored posts)
 * Stored as source 'aggregate' rows (scope 'market'/'theme'), recomputed
 * for the trailing 14 days on each run (delete + insert window).
 */
loadEnvLocal();

async function main(): Promise<void> {
  await withIngestionRun("aggregate-sentiment", null, async () => {
    const pool = getPool();
    const WINDOW = "14 days";
    await pool.query(
      `delete from sentiment_readings
        where source = 'aggregate' and reading_at >= now() - interval '${WINDOW}'`,
    );

    // Market tone per country/day.
    const { rowCount: market } = await pool.query(`
      insert into sentiment_readings
        (scope_type, scope_key, source, model_version, reading_at, score, volume, detail, as_of)
      select 'market', scope_key, 'aggregate', 'agg@1',
             date_trunc('day', reading_at), avg(score), count(*),
             jsonb_build_object('kind','market_tone'), now()
        from sentiment_readings
       where source in ('rss','reddit') and score is not null
         and reading_at >= now() - interval '${WINDOW}'
       group by scope_key, date_trunc('day', reading_at)`);

    // Theme tone per country:theme/day from tagged headlines.
    const { rowCount: themes } = await pool.query(`
      insert into sentiment_readings
        (scope_type, scope_key, source, model_version, reading_at, score, volume, detail, as_of)
      select 'theme', s.scope_key || ':' || t.theme, 'aggregate', 'agg@1',
             date_trunc('day', s.reading_at), avg(s.score), count(*),
             jsonb_build_object('kind','theme_tone'), now()
        from sentiment_readings s,
             lateral jsonb_array_elements_text(s.detail->'themes') as t(theme)
       where s.source in ('rss','reddit') and s.score is not null
         and s.reading_at >= now() - interval '${WINDOW}'
       group by s.scope_key, t.theme, date_trunc('day', s.reading_at)`);

    // Retail froth: WSB post volume and average one-sidedness.
    const { rowCount: froth } = await pool.query(`
      insert into sentiment_readings
        (scope_type, scope_key, source, model_version, reading_at, score, volume, detail, as_of)
      select 'market', 'US:froth', 'aggregate', 'agg@1',
             date_trunc('day', reading_at), avg(abs(score)), count(*),
             jsonb_build_object('kind','retail_froth'), now()
        from sentiment_readings
       where source = 'reddit' and (detail->>'froth')::boolean and score is not null
         and reading_at >= now() - interval '${WINDOW}'
       group by date_trunc('day', reading_at)`);

    const total = (market ?? 0) + (themes ?? 0) + (froth ?? 0);
    console.log(`  aggregates: ${market} market-days, ${themes} theme-days, ${froth} froth-days`);
    return { rowsWritten: total };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
