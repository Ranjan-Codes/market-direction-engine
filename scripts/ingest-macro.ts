import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool, upsertRows } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { fredProvider } from "../src/lib/providers/fred";
import { MACRO_SERIES } from "../src/config/macro-series";
import { sleep } from "../src/lib/http";

/**
 * FRED macro ingestion. Observations are vintaged: each run stores rows
 * with as_of = run time, so revisions accumulate instead of overwriting
 * (look-ahead guard for backtests). Unrevised values are deduplicated —
 * a new vintage row is only written when the value changed.
 */
loadEnvLocal();

if (!process.env.FRED_API_KEY) {
  console.warn(
    "FRED_API_KEY not set — skipping macro ingestion (get a free key at https://fred.stlouisfed.org/docs/api/api_key.html)",
  );
  process.exit(0);
}

async function main(): Promise<void> {
  await withIngestionRun("ingest-macro", "fred", async () => {
    const pool = getPool();
    let written = 0;
    for (const s of MACRO_SERIES) {
      const { rows } = await pool.query(
        `insert into macro_series (series_code, source, name, country, frequency, units, lead_lag)
         values ($1, 'fred', $2, $3, $4, $5, $6)
         on conflict (series_code) do update set name = excluded.name
         returning id`,
        [s.seriesCode, s.name, s.country, s.frequency, s.units, s.leadLag],
      );
      const seriesId = rows[0].id;

      const { data, meta } = await fredProvider.getSeries(s.fredId);

      // Latest stored value per obs_date, to skip unchanged observations.
      const { rows: existing } = await pool.query(
        `select distinct on (obs_date) obs_date::text as d, value
           from macro_observations where series_id = $1
          order by obs_date, as_of desc`,
        [seriesId],
      );
      const latest = new Map<string, string | null>(
        existing.map((r: { d: string; value: string | null }) => [r.d, r.value]),
      );
      const changed = data.filter((o) => {
        const prev = latest.get(o.obsDate);
        const prevNum = prev == null ? null : Number(prev);
        return prev === undefined || prevNum !== o.value;
      });

      written += await upsertRows(
        "macro_observations",
        ["series_id", "obs_date", "value", "as_of"],
        ["series_id", "obs_date", "as_of"],
        changed.map((o) => [seriesId, o.obsDate, o.value, meta.asOf]),
      );
      console.log(`  ${s.seriesCode}: ${data.length} obs, ${changed.length} new/revised`);
      await sleep(600);
    }
    return { rowsWritten: written };
  });
}

main()
  .catch(() => process.exitCode = 1)
  .finally(() => closePool());
