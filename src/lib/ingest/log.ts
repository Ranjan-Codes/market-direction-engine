import { getPool } from "../db";

/**
 * Wrap an ingestion job with ingestion_runs audit logging (guardrail:
 * structured logging on ingestion; alert on stale or missing data).
 * The job returns rows written; failures are recorded, then rethrown so
 * the GitHub Actions run fails visibly.
 */
export async function withIngestionRun(
  jobName: string,
  provider: string | null,
  job: () => Promise<{ rowsWritten: number; detail?: Record<string, unknown> }>,
): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    `insert into ingestion_runs (job_name, provider) values ($1, $2) returning id`,
    [jobName, provider],
  );
  const runId = rows[0].id;
  try {
    const { rowsWritten, detail } = await job();
    await pool.query(
      `update ingestion_runs
         set finished_at = now(), status = 'success', rows_written = $2, detail = $3
       where id = $1`,
      [runId, rowsWritten, JSON.stringify(detail ?? {})],
    );
    console.log(`[${jobName}] success — ${rowsWritten} rows`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `update ingestion_runs
         set finished_at = now(), status = 'error', error = $2
       where id = $1`,
      [runId, message],
    );
    console.error(`[${jobName}] FAILED — ${message}`);
    throw err;
  }
}
