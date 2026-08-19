import { readdirSync } from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { createGithubIssue } from "../src/lib/ops/github-issue";
import { WATCHDOG_CONFIG as C } from "../src/config/watchdog";

/**
 * Pipeline watchdog — runs on its own schedule, independent of the
 * ingestion/compute chain, and reports when the app has quietly stopped
 * updating. Checks, in the order they would have caught the August 2026
 * outage:
 *   1. schema drift — migrations committed but never applied (root cause)
 *   2. jobs that have not succeeded recently (the symptom that lasted 16 days)
 *   3. dataset staleness (what the user would eventually notice)
 *   4. recent job failures, workflow silence, and storage headroom
 *
 * Findings are delivered as a GitHub issue (deduped to one per problem per
 * ISO week) and the process exits non-zero so the workflow run also goes
 * red — two independent ways to reach the owner's inbox.
 */
loadEnvLocal();

type Severity = "critical" | "warning";

interface Finding {
  severity: Severity;
  check: string;
  detail: string;
  /** Stable per problem; includes the ISO week so a lasting problem re-alerts weekly. */
  fingerprint: string;
}

/** ISO-8601 week stamp, e.g. 2026-W34 — the dedupe bucket. */
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function checkSchemaDrift(week: string): Promise<Finding[]> {
  const dir = path.resolve(process.cwd(), "supabase/migrations");
  const onDisk = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await getPool().query(`select filename from schema_migrations`);
  const applied = new Set(rows.map((r: { filename: string }) => r.filename));
  const pending = onDisk.filter((f) => !applied.has(f));
  if (pending.length === 0) return [];
  return [
    {
      severity: "critical",
      check: "schema-drift",
      detail:
        `${pending.length} migration(s) committed but not applied to the database: ${pending.join(", ")}. ` +
        `Code expecting these columns will fail. Fix: run npm run migrate.`,
      fingerprint: `schema-drift|${pending.join(",")}|${week}`,
    },
  ];
}

async function checkJobSuccess(week: string): Promise<Finding[]> {
  const { rows } = await getPool().query(
    `select job_name,
            max(started_at) filter (where status = 'success')::date::text as last_success,
            (current_date - max(started_at) filter (where status = 'success')::date) as days_ago
       from ingestion_runs where job_name = any($1::text[]) group by job_name`,
    [C.expectedDailyJobs],
  );
  const seen = new Map<string, { last: string | null; days: number | null }>(
    rows.map((r: { job_name: string; last_success: string | null; days_ago: number | null }) => [
      r.job_name,
      { last: r.last_success, days: r.days_ago == null ? null : Number(r.days_ago) },
    ]),
  );
  const out: Finding[] = [];
  for (const job of C.expectedDailyJobs) {
    const rec = seen.get(job);
    if (!rec || rec.last == null) {
      out.push({
        severity: "critical",
        check: "job-never-succeeded",
        detail: `${job} has no successful run on record.`,
        fingerprint: `job-never|${job}|${week}`,
      });
    } else if (rec.days != null && rec.days > C.maxDaysWithoutSuccess) {
      out.push({
        severity: "critical",
        check: "job-not-succeeding",
        detail: `${job} last succeeded ${rec.last} (${rec.days} days ago) — the compute chain is not completing.`,
        fingerprint: `job-stale|${job}|${week}`,
      });
    }
  }
  return out;
}

async function checkStaleness(week: string): Promise<Finding[]> {
  const { rows } = await getPool().query(`
    select 'daily bars' as item, max(trade_date)::text as latest,
           greatest(current_date - max(trade_date), 0) as age from ohlcv_daily
    union all select 'breadth', max(metric_date)::text,
           greatest(current_date - max(metric_date), 0) from breadth_metrics
    union all select 'technicals', max(week_end)::text,
           greatest(current_date - max(week_end), 0) from technical_snapshots
    union all select 'regime', max(as_of_date)::text,
           greatest(current_date - max(as_of_date), 0) from regime_scores
    union all select 'signals', max(as_of_date)::text,
           greatest(current_date - max(as_of_date), 0) from signals
    union all select 'headlines', max(reading_at)::date::text,
           greatest(current_date - max(reading_at)::date, 0) from sentiment_readings
     where source in ('rss','reddit')`);
  const out: Finding[] = [];
  for (const r of rows as Array<{ item: string; latest: string | null; age: number | null }>) {
    const limit = C.maxAgeDays[r.item];
    if (limit == null) continue;
    if (r.latest == null) {
      out.push({
        severity: "critical",
        check: "no-data",
        detail: `${r.item}: no rows at all.`,
        fingerprint: `no-data|${r.item}|${week}`,
      });
    } else if (Number(r.age) > limit) {
      out.push({
        severity: "critical",
        check: "stale-data",
        detail: `${r.item}: latest ${r.latest}, ${r.age} days old (limit ${limit}).`,
        fingerprint: `stale|${r.item}|${week}`,
      });
    }
  }
  return out;
}

async function checkRecentFailures(week: string): Promise<Finding[]> {
  const { rows } = await getPool().query(
    `select job_name, count(*) as n, max(started_at)::date::text as last_failure
       from ingestion_runs
      where status = 'error' and job_name <> 'watchdog'
        and not (job_name = any($2::text[]))
        and started_at >= now() - ($1 || ' days')::interval
      group by job_name order by job_name`,
    [C.failureLookbackDays, C.ignoreFailureJobs],
  );
  return rows.map((r: { job_name: string; n: string; last_failure: string }) => ({
    severity: "warning" as Severity,
    check: "job-failures",
    detail: `${r.job_name} failed ${r.n}x in the last ${C.failureLookbackDays} days (latest ${r.last_failure}).`,
    fingerprint: `failures|${r.job_name}|${week}`,
  }));
}

async function checkStorage(week: string): Promise<Finding[]> {
  const { rows } = await getPool().query(
    `select pg_database_size(current_database()) / 1024 / 1024 as mb`,
  );
  const mb = Number(rows[0].mb);
  if (mb < C.dbSizeCapMb * C.dbSizeWarnFraction) return [];
  return [
    {
      severity: "warning",
      check: "storage",
      detail: `Database at ${mb} MB of the ${C.dbSizeCapMb} MB free tier — trim retention or upgrade before writes start failing.`,
      fingerprint: `storage|${Math.round(mb / 25)}|${week}`,
    },
  ];
}

/** Scheduled workflows stop silently (GitHub disables them after 60 idle days). */
async function checkWorkflowActivity(week: string): Promise<Finding[]> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return [];
  const out: Finding[] = [];
  for (const wf of ["ingest.yml", "sentiment.yml"]) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/${wf}/runs?per_page=1&status=completed`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "market-direction-engine",
          },
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!res.ok) continue;
      const body = (await res.json()) as {
        workflow_runs?: Array<{ conclusion: string; updated_at: string }>;
      };
      const run = body.workflow_runs?.[0];
      if (!run) {
        out.push({
          severity: "warning",
          check: "workflow-silent",
          detail: `${wf} has no completed runs — is the schedule disabled?`,
          fingerprint: `wf-none|${wf}|${week}`,
        });
        continue;
      }
      const ageDays = Math.floor((Date.now() - new Date(run.updated_at).getTime()) / 86_400_000);
      if (ageDays > C.maxDaysSinceWorkflowRun) {
        out.push({
          severity: "warning",
          check: "workflow-silent",
          detail: `${wf} last ran ${ageDays} days ago — GitHub disables schedules after 60 idle days.`,
          fingerprint: `wf-silent|${wf}|${week}`,
        });
      } else if (run.conclusion !== "success") {
        out.push({
          severity: "warning",
          check: "workflow-failing",
          detail: `${wf}: most recent completed run concluded "${run.conclusion}".`,
          fingerprint: `wf-fail|${wf}|${run.conclusion}|${week}`,
        });
      }
    } catch {
      // API unreachable — the DB-side checks still cover the outage case.
    }
  }
  return out;
}

async function main(): Promise<void> {
  await withIngestionRun("watchdog", null, async () => {
    const pool = getPool();
    const week = isoWeek(new Date());
    const findings = [
      ...(await checkSchemaDrift(week)),
      ...(await checkJobSuccess(week)),
      ...(await checkStaleness(week)),
      ...(await checkRecentFailures(week)),
      ...(await checkStorage(week)),
      ...(await checkWorkflowActivity(week)),
    ];

    if (findings.length === 0) {
      console.log("  all clear — pipeline fresh, schema in sync, storage fine");
      return { rowsWritten: 0, detail: { findings: 0 } };
    }

    for (const f of findings) {
      console.error(`  [${f.severity}] ${f.check}: ${f.detail}`);
    }

    // One issue per problem per ISO week, recorded in the alerts table.
    let delivered = 0;
    for (const f of findings) {
      const { rows: seen } = await pool.query(
        `select 1 from alerts where alert_type = 'watchdog' and fingerprint = $1 limit 1`,
        [f.fingerprint],
      );
      if (seen.length > 0) continue;
      const ok = await createGithubIssue({
        title: `[watchdog] ${f.check}: ${f.detail.slice(0, 90)}`,
        body:
          `**${f.severity.toUpperCase()} — ${f.check}**\n\n${f.detail}\n\n` +
          `Detected by the pipeline watchdog, which runs independently of the ingestion chain.\n` +
          `_Analytical decision support only — not investment advice._`,
        labels: ["alert", "watchdog"],
      });
      await pool.query(
        `insert into alerts (alert_type, subject, message, fingerprint, delivered)
         values ('watchdog', $1, $2, $3, $4)`,
        [f.check, f.detail, f.fingerprint, ok],
      );
      if (ok) delivered++;
    }

    const critical = findings.filter((f) => f.severity === "critical").length;
    console.error(
      `  ${findings.length} finding(s), ${critical} critical, ${delivered} issue(s) raised`,
    );
    // Fail the run so GitHub's own failure notification fires too.
    process.exitCode = 1;
    return { rowsWritten: findings.length, detail: { findings, critical } };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
