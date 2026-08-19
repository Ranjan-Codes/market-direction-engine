/**
 * Watchdog thresholds — config, not code.
 *
 * The watchdog exists because a pipeline outage is otherwise invisible:
 * between 3 and 18 August 2026 the app kept serving a plausible dashboard
 * while its verdicts were frozen, because prices and headlines still
 * updated but the compute chain had died. In-pipeline alerts cannot
 * report that — they die with the pipeline — so this check runs on its
 * own schedule and reports from outside.
 */
export const WATCHDOG_CONFIG = {
  /**
   * Maximum age in days before a dataset counts as stale. Daily-keyed data
   * allows for a weekend plus a holiday; weekly-keyed data (week_end is the
   * current week's Friday, so it can even be a future date) allows a week
   * plus slack.
   */
  maxAgeDays: {
    "daily bars": 4,
    breadth: 4,
    headlines: 3,
    technicals: 5,
    regime: 5,
    signals: 5,
  } as Record<string, number>,

  /** Jobs expected to succeed on every weekday run, and the allowed gap. */
  expectedDailyJobs: [
    "ingest-ohlcv-incremental",
    "compute-technicals",
    "compute-breadth",
    "compute-regime",
    "compute-signals",
    "quality-check",
  ],
  maxDaysWithoutSuccess: 4,

  /** Recent-failure scan window. */
  failureLookbackDays: 3,

  /** Warn when the database passes this share of the Supabase free tier. */
  dbSizeWarnFraction: 0.85,
  dbSizeCapMb: 500,

  /**
   * Scheduled GitHub workflows are disabled automatically after 60 days
   * without repository activity — warn well before that.
   */
  maxDaysSinceWorkflowRun: 3,
} as const;
