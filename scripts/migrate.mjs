/**
 * Migration runner: applies supabase/migrations/*.sql in filename order,
 * skipping any already recorded in schema_migrations. Each migration runs
 * in its own transaction.
 *
 * Usage:  node scripts/migrate.mjs
 * Env:    SUPABASE_DB_URL (session-pooler string, may contain [YOUR-PASSWORD])
 *         SUPABASE_DB_PASSWORD (spliced into the URL placeholder)
 *         Loaded from .env.local when present (local dev); in GitHub Actions
 *         they come from repository secrets.
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local loader — real env vars take precedence.
const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

const { SUPABASE_DB_URL, SUPABASE_DB_PASSWORD } = process.env;
if (!SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL is not set (see .env.example).");
  process.exit(1);
}
const connectionString = SUPABASE_DB_URL.replace(
  "[YOUR-PASSWORD]",
  encodeURIComponent(SUPABASE_DB_PASSWORD ?? ""),
);

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )`);

  const dir = path.join(root, "supabase", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("select filename from schema_migrations");
  const applied = new Set(rows.map((r) => r.filename));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip    ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    console.log(`apply   ${file} ...`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into schema_migrations (filename) values ($1)",
        [file],
      );
      await client.query("commit");
      ran++;
    } catch (err) {
      await client.query("rollback");
      console.error(`FAILED  ${file}: ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`done — ${ran} migration(s) applied, ${applied.size} previously applied.`);
} finally {
  await client.end();
}
