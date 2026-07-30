import { loadEnvLocal } from "../src/lib/load-env";
import { getPool, closePool } from "../src/lib/db";

loadEnvLocal();

async function main() {
  const pool = getPool();
  const q = async (label: string, sql: string) => {
    try {
      const r = await pool.query(sql);
      console.log(`\n## ${label}`);
      console.table(r.rows);
    } catch (e) {
      console.log(`\n## ${label} -> ERROR ${(e as Error).message}`);
    }
  };

  await q(
    "heap vs index vs toast",
    `select c.relname,
            pg_size_pretty(pg_relation_size(c.oid)) heap,
            pg_size_pretty(pg_indexes_size(c.oid)) indexes,
            pg_size_pretty(coalesce(pg_total_relation_size(t.oid),0)) toast,
            pg_size_pretty(pg_total_relation_size(c.oid)) total,
            c.reltuples::bigint est_rows
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_class t on t.oid = c.reltoastrelid
      where n.nspname = 'public' and c.relkind = 'r'
        and pg_total_relation_size(c.oid) > 100000
      order by pg_total_relation_size(c.oid) desc`,
  );

  await q(
    "index sizes + usage (idx_scan=0 means never used)",
    `select s.relname as table, s.indexrelname as index, s.idx_scan,
            pg_size_pretty(pg_relation_size(s.indexrelid)) size
       from pg_stat_user_indexes s
      where pg_relation_size(s.indexrelid) > 100000
      order by pg_relation_size(s.indexrelid) desc`,
  );

  await q(
    "bloat: dead tuples / vacuum history",
    `select relname, n_live_tup, n_dead_tup,
            round(100.0 * n_dead_tup / greatest(n_live_tup,1), 1) pct_dead,
            last_vacuum::text, last_autovacuum::text
       from pg_stat_user_tables
      where n_live_tup > 1000
      order by n_dead_tup desc`,
  );

  await q(
    "ohlcv_weekly rows by 5y bucket",
    `select (extract(year from week_end)::int / 5) * 5 as era,
            count(*) rows,
            pg_size_pretty((count(*) * 213)::bigint) approx_heap
       from ohlcv_weekly group by 1 order by 1`,
  );

  await q(
    "ohlcv_daily rows by year",
    `select extract(year from trade_date)::int yr, count(*) rows
       from ohlcv_daily group by 1 order by 1`,
  );

  await q(
    "technical_snapshots rows by year",
    `select extract(year from week_end)::int yr, count(*) rows
       from technical_snapshots group by 1 order by 1`,
  );

  await q(
    "ohlcv coverage by instrument type",
    `select i.instrument_type, count(distinct i.id) instruments,
            count(w.instrument_id) weekly_rows
       from instruments i left join ohlcv_weekly w on w.instrument_id = i.id
      group by 1 order by 3 desc`,
  );

  await q(
    "orphan check: weekly bars for instruments not in any index + not watchlisted",
    `select count(distinct w.instrument_id) instruments, count(*) rows
       from ohlcv_weekly w
      where not exists (select 1 from index_membership m where m.constituent_id = w.instrument_id)
        and not exists (select 1 from watchlist_items x where x.instrument_id = w.instrument_id)
        and not exists (select 1 from instruments i where i.id = w.instrument_id and i.instrument_type <> 'equity')`,
  );

  await q(
    "macro_observations: vintage duplication",
    `select count(*) total_obs,
            count(distinct (series_id, obs_date)) distinct_points,
            count(*) - count(distinct (series_id, obs_date)) extra_vintages
       from macro_observations`,
  );

  await q(
    "adj columns actually differ from raw? (weekly sample)",
    `select count(*) rows,
            sum(case when adj_close is distinct from close then 1 else 0 end) adj_differs,
            sum(case when adj_volume is distinct from volume then 1 else 0 end) advol_differs,
            sum(case when volume is null then 1 else 0 end) vol_null
       from ohlcv_weekly`,
  );

  await q(
    "ohlcv_weekly: exact avg bytes per column (sampled 50k rows)",
    `with s as (select * from ohlcv_weekly limit 50000)
     select round(avg(pg_column_size(open)+pg_column_size(high)+pg_column_size(low)+pg_column_size(close)),1) raw_ohlc,
            round(avg(pg_column_size(adj_volume)),1) adj_vol,
            round(avg(pg_column_size(week_start)),1) week_start,
            round(avg(pg_column_size(source)),1) source,
            round(avg(pg_column_size(as_of)+pg_column_size(ingested_at)),1) two_timestamps,
            round(avg(pg_column_size(s.*)),1) whole_row
       from s`,
  );

  await q(
    "ohlcv_daily: exact avg bytes per column (sampled 50k rows)",
    `with s as (select * from ohlcv_daily limit 50000)
     select round(avg(pg_column_size(open)+pg_column_size(high)+pg_column_size(low)),1) raw_ohl,
            round(avg(pg_column_size(close)),1) raw_close,
            round(avg(pg_column_size(adj_volume)),1) adj_vol,
            round(avg(pg_column_size(source)),1) source,
            round(avg(pg_column_size(as_of)+pg_column_size(ingested_at)),1) two_timestamps,
            round(avg(pg_column_size(s.*)),1) whole_row
       from s`,
  );

  await q(
    "technical_snapshots: whole row + text/jsonb weight",
    `with s as (select * from technical_snapshots limit 50000)
     select round(avg(pg_column_size(s.*)),1) whole_row from s`,
  );

  await q(
    "sentiment_readings growth per day + source mix (unbounded? no retention policy)",
    `select ingested_at::date d, count(*) rows,
            pg_size_pretty((count(*) * 542)::bigint) approx
       from sentiment_readings group by 1 order by 1`,
  );

  await q(
    "sentiment_readings: raw items vs aggregates",
    `select source, scope_type, count(*) rows,
            round(avg(pg_column_size(detail)),0) detail_bytes
       from sentiment_readings group by 1,2 order by 3 desc`,
  );

  await q(
    "backtest runs (what weekly history the validation used)",
    `select id, status, period_start::text, period_end::text, weights_version
       from backtest_runs order by id`,
  );

  await q(
    "weekly coverage: instruments per era",
    `select extract(year from week_end)::int yr, count(distinct instrument_id) instruments, count(*) rows
       from ohlcv_weekly
      where extract(year from week_end)::int in (2000,2005,2010,2015,2020,2023,2026)
      group by 1 order by 1`,
  );

  await closePool();
}

main().catch(async (e) => {
  console.error(e);
  await closePool();
  process.exit(1);
});
