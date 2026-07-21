import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { getWatchlist } from "../src/lib/data/watchlist";
import { ALERT_CONFIG } from "../src/config/alerts";

/**
 * Threshold alerts, evaluated after the daily compute chain. Delivery =
 * a GitHub issue in the repo (GitHub emails the owner automatically);
 * locally (no GITHUB_TOKEN) alerts are stored + printed only.
 * A fingerprint per alert dedupes: re-alert only when content changes.
 */
loadEnvLocal();

interface Candidate {
  type: string;
  subject: string;
  message: string;
  fingerprint: string;
}

async function evaluate(): Promise<Candidate[]> {
  const pool = getPool();
  const out: Candidate[] = [];

  // Latest regime + gauge per index (and previous week's regime for change detection).
  const { rows: regimes } = await pool.query(`
    with ranked as (
      select i.symbol, r.regime, r.composite_score, r.as_of_date,
             r.breakdown->'gauge' as gauge,
             row_number() over (partition by r.index_id order by r.as_of_date desc) as rn
        from regime_scores r join instruments i on i.id = r.index_id
    )
    select cur.symbol, cur.regime, cur.composite_score, cur.as_of_date::text, cur.gauge,
           prev.regime as prev_regime
      from ranked cur left join ranked prev on prev.symbol = cur.symbol and prev.rn = 2
     where cur.rn = 1`);
  for (const r of regimes) {
    const g = r.gauge as { direction: string; intensity: number; evidence: Array<{ detail: string }> };
    if (g && g.direction !== "none" && g.intensity >= ALERT_CONFIG.gaugeIntensityAt) {
      out.push({
        type: "gauge",
        subject: r.symbol,
        message:
          `${r.symbol}: ${g.direction.replace(/-/g, " ")} at intensity ${g.intensity} (week ${r.as_of_date}).\n` +
          g.evidence.map((e) => `- ${e.detail}`).join("\n"),
        fingerprint: `${r.symbol}|${g.direction}|${Math.round(g.intensity / 10)}`,
      });
    }
    if (ALERT_CONFIG.regimeChanges && r.prev_regime && r.prev_regime !== r.regime) {
      out.push({
        type: "regime_change",
        subject: r.symbol,
        message: `${r.symbol}: regime changed ${r.prev_regime} → ${r.regime} (composite ${r.composite_score}, week ${r.as_of_date}).`,
        fingerprint: `${r.symbol}|${r.prev_regime}->${r.regime}|${r.as_of_date}`,
      });
    }
  }

  // Breadth divergence turning on.
  if (ALERT_CONFIG.breadthDivergence) {
    const { rows: div } = await pool.query(`
      select i.symbol, b.metric_date::text
        from breadth_metrics b join instruments i on i.id = b.index_id
       where b.breadth_divergence
         and (b.index_id, b.metric_date) in (
           select index_id, max(metric_date) from breadth_metrics group by index_id)`);
    for (const d of div) {
      out.push({
        type: "breadth_divergence",
        subject: d.symbol,
        message: `${d.symbol}: breadth divergence — index near highs while internals deteriorate (${d.metric_date}). Leading warning.`,
        fingerprint: `${d.symbol}|divergence|${d.metric_date.slice(0, 7)}`,
      });
    }
  }

  // Watchlist verdict extremes.
  if (ALERT_CONFIG.watchlistVerdicts) {
    for (const e of await getWatchlist()) {
      if (e.suggestion.verdict === "overbought-risk" || e.suggestion.verdict === "oversold-setup") {
        out.push({
          type: "watchlist_verdict",
          subject: e.symbol,
          message:
            `${e.symbol} (watchlist): ${e.suggestion.headline} (week ${e.week_end}).\n` +
            e.suggestion.evidence.map((ev) => `- ${ev}`).join("\n"),
          fingerprint: `${e.symbol}|${e.suggestion.verdict}|${e.week_end}`,
        });
      }
    }
  }
  return out;
}

async function deliverGithubIssue(c: Candidate): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // owner/name, set by Actions
  if (!token || !repo) return false;
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "market-direction-engine",
    },
    body: JSON.stringify({
      title: `[${c.type}] ${c.subject}: ${c.message.split("\n")[0].slice(0, 80)}`,
      body: `${c.message}\n\n_Analytical decision support only — not investment advice._`,
      labels: ["alert", c.type],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  return res.ok;
}

async function main(): Promise<void> {
  await withIngestionRun("check-alerts", null, async () => {
    const pool = getPool();
    const candidates = await evaluate();
    let fired = 0;
    for (const c of candidates) {
      const { rows: existing } = await pool.query(
        `select 1 from alerts where alert_type = $1 and subject = $2 and fingerprint = $3 limit 1`,
        [c.type, c.subject, c.fingerprint],
      );
      if (existing.length > 0) continue; // already alerted with this content
      const delivered = await deliverGithubIssue(c);
      await pool.query(
        `insert into alerts (alert_type, subject, message, fingerprint, delivered)
         values ($1, $2, $3, $4, $5)`,
        [c.type, c.subject, c.message, c.fingerprint, delivered],
      );
      console.log(`  ALERT [${c.type}] ${c.subject}${delivered ? " (issue created)" : " (stored)"}`);
      fired++;
    }
    console.log(`  ${candidates.length} conditions true, ${fired} new alerts`);
    return { rowsWritten: fired, detail: { conditions: candidates.length } };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
