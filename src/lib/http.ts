/**
 * HTTP client for all provider calls: retry with exponential backoff,
 * timeout, and polite pacing. Every free-tier call goes through here so
 * quota behaviour is consistent (guardrail: retry/backoff/staleness, never
 * silently wrong data).
 */

const DEFAULT_UA = "market-direction-engine/0.1 (personal research tool)";

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  /** Base delay for exponential backoff (doubles per attempt). */
  backoffMs?: number;
}

export async function fetchWithRetry(
  url: string,
  opts: FetchOptions = {},
): Promise<Response> {
  const { timeoutMs = 30_000, retries = 3, backoffMs = 1_000 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": DEFAULT_UA, ...opts.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      // 429/5xx are retryable; 4xx otherwise is a hard failure.
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      lastError = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("HTTP 4")) throw err;
      lastError = err;
    }
    if (attempt < retries) {
      await sleep(backoffMs * 2 ** attempt);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to fetch ${url}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
