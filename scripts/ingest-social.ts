import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { fetchWithRetry, sleep } from "../src/lib/http";
import { tagThemes } from "../src/lib/sentiment/themes";
import { STOCKTWITS_INDEX_PROXIES, REDDIT_SUBS } from "../src/config/feeds";

/**
 * Social sentiment (retail-froth gauge, contrarian input):
 * - StockTwits per-symbol bull/bear message ratios (index ETF proxies +
 *   top-10 US mega-caps). Cloudflare-blocked from some networks — each
 *   symbol fails gracefully; the job only errors if everything fails AND
 *   Reddit is also unavailable.
 * - Reddit hot-post titles per sub via OAuth client-credentials (skipped
 *   without REDDIT_CLIENT_ID/SECRET). Titles stored like RSS headlines for
 *   FinBERT scoring; volume/upvotes kept for the froth gauge. WSB is
 *   explicitly a contrarian gauge, not signal.
 */
loadEnvLocal();

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface StResponse {
  messages?: Array<{ entities?: { sentiment?: { basic?: string } | null } }>;
}

async function stocktwits(pool: ReturnType<typeof getPool>): Promise<{ ok: number; failed: number }> {
  const { rows } = await pool.query(`
    select symbol from instruments
     where instrument_type = 'equity' and coalesce(metadata->>'country','US') = 'US'
     order by (metadata->>'marketCap')::numeric desc nulls last limit 10`);
  const symbols = [...STOCKTWITS_INDEX_PROXIES, ...rows.map((r: { symbol: string }) => r.symbol)];
  let ok = 0;
  let failed = 0;
  for (const symbol of symbols) {
    try {
      const res = await fetchWithRetry(
        `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`,
        { headers: { "User-Agent": BROWSER_UA }, retries: 1 },
      );
      const body = (await res.json()) as StResponse;
      const msgs = body.messages ?? [];
      const bulls = msgs.filter((m) => m.entities?.sentiment?.basic === "Bullish").length;
      const bears = msgs.filter((m) => m.entities?.sentiment?.basic === "Bearish").length;
      const tagged = bulls + bears;
      await pool.query(
        `insert into sentiment_readings
           (scope_type, scope_key, source, reading_at, score, volume, detail, as_of)
         values ('instrument', $1, 'stocktwits', now(), $2, $3, $4, now())`,
        [
          symbol,
          tagged > 0 ? (bulls - bears) / tagged : null,
          msgs.length,
          JSON.stringify({ bulls, bears, sample: msgs.length }),
        ],
      );
      ok++;
    } catch {
      failed++;
    }
    await sleep(2_000);
  }
  console.log(`  stocktwits: ${ok} symbols ok, ${failed} failed`);
  return { ok, failed };
}

interface RedditListing {
  data?: { children?: Array<{ data: { title: string; permalink: string; score: number; num_comments: number; created_utc: number } }> };
}

async function reddit(pool: ReturnType<typeof getPool>): Promise<{ ok: number; skipped: boolean }> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  const ua = process.env.REDDIT_USER_AGENT ?? "market-direction-engine/0.1";
  if (!id || !secret) {
    console.log("  reddit: skipped (no REDDIT_CLIENT_ID/SECRET)");
    return { ok: 0, skipped: true };
  }
  // fetchWithRetry is GET-only; do the token POST manually.
  const token = await (async () => {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": ua,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`reddit token HTTP ${res.status}`);
    return ((await res.json()) as { access_token: string }).access_token;
  })();

  const { rows: existing } = await pool.query(`
    select detail->>'url' as url from sentiment_readings
     where source = 'reddit' and reading_at >= now() - interval '7 days'`);
  const seen = new Set<string>(existing.map((r: { url: string }) => r.url));

  let ok = 0;
  for (const sub of REDDIT_SUBS) {
    const res = await fetch(`https://oauth.reddit.com/r/${sub}/hot.json?limit=50`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": ua },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`  reddit r/${sub}: HTTP ${res.status}`);
      continue;
    }
    const body = (await res.json()) as RedditListing;
    for (const child of body.data?.children ?? []) {
      const p = child.data;
      const url = `https://reddit.com${p.permalink}`;
      if (seen.has(url)) continue;
      seen.add(url);
      await pool.query(
        `insert into sentiment_readings
           (scope_type, scope_key, source, reading_at, score, volume, detail, as_of)
         values ('market', $1, 'reddit', $2, null, $3, $4, now())`,
        [
          sub === "UKInvestments" ? "UK" : "US",
          new Date(p.created_utc * 1000).toISOString(),
          p.score,
          JSON.stringify({
            headline: p.title,
            url,
            sub,
            comments: p.num_comments,
            froth: sub === "wallstreetbets",
            themes: tagThemes(p.title),
          }),
        ],
      );
      ok++;
    }
    await sleep(2_000);
  }
  console.log(`  reddit: ${ok} new posts across ${REDDIT_SUBS.length} subs`);
  return { ok, skipped: false };
}

async function main(): Promise<void> {
  await withIngestionRun("ingest-social", "stocktwits+reddit", async () => {
    const pool = getPool();
    const st = await stocktwits(pool);
    const rd = await reddit(pool);
    if (st.ok === 0 && (rd.skipped || rd.ok === 0)) {
      throw new Error("all social sources unavailable");
    }
    return { rowsWritten: st.ok + rd.ok, detail: { stocktwits: st, reddit: rd } };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
