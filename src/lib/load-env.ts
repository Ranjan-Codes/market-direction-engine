import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Load .env.local into process.env for standalone scripts (ingestion jobs,
 * migrations). Real environment variables always win, so GitHub Actions
 * secrets pass straight through. Next.js loads .env.local itself — this is
 * only for `tsx scripts/*.ts` entrypoints.
 */
export function loadEnvLocal(): void {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
