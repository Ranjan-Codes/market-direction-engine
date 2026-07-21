import { z } from "zod";

/**
 * Server-side environment validation.
 *
 * Secrets live ONLY in `.env.local` (dev), GitHub Actions secrets (jobs), and
 * Netlify environment variables (hosting). Never in code, commits, or logs.
 *
 * Provider API keys are optional: the provider registry skips any provider
 * whose key is absent, so a partially-configured environment still runs.
 */
const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  ALPHA_VANTAGE_API_KEY: z.string().optional(),
  TIINGO_API_KEY: z.string().optional(),
  TWELVE_DATA_API_KEY: z.string().optional(),
  EODHD_API_KEY: z.string().optional(),

  FRED_API_KEY: z.string().optional(),

  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Parse and cache server env. Called lazily so `next build` and unit tests
 * don't require a fully configured environment.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => i.path.join("."))
      .join(", ");
    throw new Error(
      `Invalid or missing environment variables: ${missing}. ` +
        `Copy .env.example to .env.local and fill in the values.`,
    );
  }
  cached = parsed.data;
  return cached;
}
