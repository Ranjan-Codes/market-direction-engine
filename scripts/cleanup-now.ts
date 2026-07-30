import { loadEnvLocal } from "../src/lib/load-env";
import { getPool, closePool } from "../src/lib/db";

loadEnvLocal();

async function main() {
  const pool = getPool();

  console.log("=== Database cleanup ===\n");

  // 1. Preview
  const preview = await pool.query(`
    SELECT 'equity daily bars (>400d)' AS what, count(*) AS rows
      FROM ohlcv_daily o JOIN instruments i ON i.id = o.instrument_id
     WHERE i.instrument_type = 'equity' AND o.trade_date < current_date - 400
    UNION ALL
    SELECT 'non-equity daily bars (>400d)', count(*)
      FROM ohlcv_daily o JOIN instruments i ON i.id = o.instrument_id
     WHERE i.instrument_type <> 'equity' AND o.trade_date < current_date - 400
    UNION ALL
    SELECT 'technical_snapshots (>52w)', count(*)
      FROM technical_snapshots WHERE week_end < current_date - 364
  `);
  console.log("Rows to delete:");
  console.table(preview.rows);

  // 2. Delete old equity daily bars
  const r1 = await pool.query(`
    DELETE FROM ohlcv_daily o USING instruments i
     WHERE i.id = o.instrument_id AND i.instrument_type = 'equity'
       AND o.trade_date < current_date - 400
  `);
  console.log(`Deleted ${r1.rowCount} equity daily bars`);

  // 3. Delete old non-equity daily bars
  const r2 = await pool.query(`
    DELETE FROM ohlcv_daily o USING instruments i
     WHERE i.id = o.instrument_id AND i.instrument_type <> 'equity'
       AND o.trade_date < current_date - 400
  `);
  console.log(`Deleted ${r2.rowCount} non-equity daily bars`);

  // 4. Delete old technical snapshots
  const r3 = await pool.query(`
    DELETE FROM technical_snapshots
     WHERE week_end < current_date - 364
  `);
  console.log(`Deleted ${r3.rowCount} technical snapshots`);

  // 5. Show new sizes (logical — physical reclaim needs VACUUM FULL in SQL Editor)
  const sizes = await pool.query(`
    SELECT c.relname,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
           c.reltuples::bigint AS est_rows
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND pg_total_relation_size(c.oid) > 100000
     ORDER BY pg_total_relation_size(c.oid) DESC
  `);
  console.log("\nTable sizes after delete (physical reclaim needs VACUUM FULL):");
  console.table(sizes.rows);

  await closePool();
}

main().catch(async (e) => {
  console.error(e);
  await closePool();
  process.exit(1);
});
