import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { fetchFeed } from "../src/lib/sentiment/rss";
import { tagThemes } from "../src/lib/sentiment/themes";
import { RSS_FEEDS } from "../src/config/feeds";
import { sleep } from "../src/lib/http";

/**
 * RSS headline ingestion → sentiment_readings (source 'rss', score null
 * until the FinBERT job scores it). Headlines + metadata only. Dedupe by
 * URL against the trailing 21 days.
 */
loadEnvLocal();

async function main(): Promise<void> {
  await withIngestionRun("ingest-headlines", "rss", async () => {
    const pool = getPool();
    // Dedupe on URL AND on feed+title — feeds re-serve identical stories
    // under varying URLs (tracking params, republishes).
    const { rows: existing } = await pool.query(`
      select detail->>'url' as url,
             (detail->>'feed') || '|' || (detail->>'headline') as fh
        from sentiment_readings
       where source in ('rss','reddit') and reading_at >= now() - interval '21 days'`);
    const seen = new Set<string>(existing.map((r: { url: string }) => r.url));
    const seenTitle = new Set<string>(existing.map((r: { fh: string }) => r.fh));

    let written = 0;
    const perFeed: Record<string, number> = {};
    for (const feed of RSS_FEEDS) {
      try {
        const headlines = await fetchFeed(feed);
        let n = 0;
        for (const h of headlines) {
          const fh = `${h.feedKey}|${h.title}`;
          if (!h.url || seen.has(h.url) || seenTitle.has(fh)) continue;
          seen.add(h.url);
          seenTitle.add(fh);
          const themes = tagThemes(`${h.title} ${h.summary}`);
          await pool.query(
            `insert into sentiment_readings
               (scope_type, scope_key, source, reading_at, score, volume, detail, as_of)
             values ('market', $1, 'rss', $2, null, 1, $3, now())`,
            [
              h.country,
              h.publishedAt,
              JSON.stringify({
                headline: h.title,
                summary: h.summary,
                url: h.url,
                feed: h.feedKey,
                official: h.official,
                themes,
              }),
            ],
          );
          n++;
        }
        perFeed[feed.key] = n;
        written += n;
        console.log(`  ${feed.key}: ${headlines.length} items, ${n} new`);
      } catch (err) {
        perFeed[feed.key] = -1;
        console.warn(`  ${feed.key} FAILED: ${err instanceof Error ? err.message : err}`);
      }
      await sleep(1_000);
    }
    const failed = Object.values(perFeed).filter((v) => v === -1).length;
    if (failed > RSS_FEEDS.length / 2) {
      throw new Error(`${failed}/${RSS_FEEDS.length} feeds failed`);
    }
    return { rowsWritten: written, detail: { perFeed } };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
