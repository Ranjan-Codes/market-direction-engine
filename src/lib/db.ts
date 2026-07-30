import pg from "pg";

/**
 * Postgres access for ingestion/compute jobs (service-level, bypasses RLS).
 * Uses the session-pooler connection string; the password is spliced into
 * the [YOUR-PASSWORD] placeholder from SUPABASE_DB_PASSWORD.
 */
let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set");
  const connectionString = url.replace(
    "[YOUR-PASSWORD]",
    encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? ""),
  );
  pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Batched multi-row upsert. Splits rows into chunks to stay under the
 * Postgres parameter limit. Returns total rows written.
 */
export async function upsertRows(
  table: string,
  columns: string[],
  conflictColumns: string[],
  rows: unknown[][],
  opts: { updateOnConflict?: boolean; chunkSize?: number } = {},
): Promise<number> {
  if (rows.length === 0) return 0;
  const { updateOnConflict = true } = opts;
  const chunkSize =
    opts.chunkSize ?? Math.max(1, Math.floor(60_000 / columns.length));
  const client = await getPool().connect();
  let written = 0;
  try {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const params: unknown[] = [];
      const tuples = chunk.map((row, r) => {
        params.push(...row);
        const base = r * columns.length;
        return `(${columns.map((_, c) => `$${base + c + 1}`).join(",")})`;
      });
      const updateCols = columns.filter((c) => !conflictColumns.includes(c));
      const conflictAction =
        updateOnConflict && updateCols.length > 0
          ? `do update set ${updateCols.map((c) => `${c} = excluded.${c}`).join(", ")}`
          : "do nothing";
      const sql = `insert into ${table} (${columns.join(",")})
        values ${tuples.join(",")}
        on conflict (${conflictColumns.join(",")}) ${conflictAction}`;
      const res = await client.query(sql, params);
      written += res.rowCount ?? 0;
    }
  } finally {
    client.release();
  }
  return written;
}
