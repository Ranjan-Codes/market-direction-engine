import { getServerEnv } from "../env";

/* ── Types ───────────────────────────────────────────────────────────── */

interface IGSession {
  cst: string;
  securityToken: string;
  apiKey: string;
  baseUrl: string;
}

export interface IGPosition {
  epic: string;
  instrumentName: string;
  instrumentType: string;
  direction: string;
  size: number;
  yahooSymbol: string | null;
}

export interface IGWatchlistSummary {
  id: string;
  name: string;
}

export interface IGWatchlistItem {
  epic: string;
  instrumentName: string;
  instrumentType: string;
  yahooSymbol: string | null;
}

/* ── Auth ─────────────────────────────────────────────────────────────── */

async function authenticate(): Promise<IGSession> {
  const env = getServerEnv();
  if (!env.IG_API_KEY || !env.IG_IDENTIFIER || !env.IG_PASSWORD) {
    throw new Error("IG credentials not configured");
  }

  const baseUrl = env.IG_ACCOUNT_TYPE === "demo"
    ? "https://demo-api.ig.com/gateway/deal"
    : "https://api.ig.com/gateway/deal";

  const res = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: {
      "X-IG-API-KEY": env.IG_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json; charset=UTF-8",
      Version: "2",
    },
    body: JSON.stringify({
      identifier: env.IG_IDENTIFIER,
      password: env.IG_PASSWORD,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IG auth failed (${res.status}): ${text}`);
  }

  const cst = res.headers.get("CST");
  const securityToken = res.headers.get("X-SECURITY-TOKEN");
  if (!cst || !securityToken) {
    throw new Error("IG auth response missing CST or security token");
  }

  return { cst, securityToken, apiKey: env.IG_API_KEY, baseUrl };
}

function authHeaders(session: IGSession): Record<string, string> {
  return {
    "X-IG-API-KEY": session.apiKey,
    CST: session.cst,
    "X-SECURITY-TOKEN": session.securityToken,
    Accept: "application/json; charset=UTF-8",
  };
}

/* ── Symbol mapping ──────────────────────────────────────────────────── */

function epicToYahoo(epic: string, instrumentName: string, instrumentType: string): string | null {
  if (instrumentType !== "SHARES") return null;

  const parts = epic.split(".");
  if (parts.length < 4) return null;
  const ticker = parts[2];
  if (!ticker) return null;

  const nameLower = instrumentName.toLowerCase();
  if (epic.startsWith("KA.D.") || epic.startsWith("KC.D.")) {
    if (nameLower.includes("(us)") || !ticker.includes("-")) {
      return ticker;
    }
  }

  if (epic.startsWith("KB.D.") || nameLower.includes("(uk)") || nameLower.includes("london")) {
    return `${ticker}.L`;
  }

  if (epic.includes(".DE.")) return `${ticker}.DE`;
  if (epic.includes(".FR.")) return `${ticker}.PA`;
  if (epic.includes(".HK.")) return `${ticker}.HK`;

  return ticker;
}

/* ── Public API ───────────────────────────────────────────────────────── */

export function isIGConfigured(): boolean {
  const env = getServerEnv();
  return !!(env.IG_API_KEY && env.IG_IDENTIFIER && env.IG_PASSWORD);
}

export async function getIGPositions(): Promise<IGPosition[]> {
  const session = await authenticate();
  const res = await fetch(`${session.baseUrl}/positions`, {
    headers: { ...authHeaders(session), Version: "2" },
  });

  if (!res.ok) {
    throw new Error(`IG positions fetch failed (${res.status})`);
  }

  const data = await res.json();
  const positions: IGPosition[] = [];

  for (const p of data.positions ?? []) {
    const m = p.market;
    if (!m?.epic) continue;
    positions.push({
      epic: m.epic,
      instrumentName: m.instrumentName ?? "",
      instrumentType: m.instrumentType ?? "",
      direction: p.position?.direction ?? "BUY",
      size: p.position?.size ?? 0,
      yahooSymbol: epicToYahoo(m.epic, m.instrumentName ?? "", m.instrumentType ?? ""),
    });
  }

  return positions;
}

export async function getIGWatchlists(): Promise<IGWatchlistSummary[]> {
  const session = await authenticate();
  const res = await fetch(`${session.baseUrl}/watchlists`, {
    headers: authHeaders(session),
  });

  if (!res.ok) {
    throw new Error(`IG watchlists fetch failed (${res.status})`);
  }

  const data = await res.json();
  return (data.watchlists ?? []).map((w: { id: string; name: string }) => ({
    id: w.id,
    name: w.name,
  }));
}

export async function getIGWatchlistItems(watchlistId: string): Promise<IGWatchlistItem[]> {
  const session = await authenticate();
  const res = await fetch(`${session.baseUrl}/watchlists/${encodeURIComponent(watchlistId)}`, {
    headers: authHeaders(session),
  });

  if (!res.ok) {
    throw new Error(`IG watchlist fetch failed (${res.status})`);
  }

  const data = await res.json();
  const items: IGWatchlistItem[] = [];

  for (const m of data.markets ?? []) {
    items.push({
      epic: m.epic ?? "",
      instrumentName: m.instrumentName ?? "",
      instrumentType: m.instrumentType ?? "",
      yahooSymbol: epicToYahoo(m.epic ?? "", m.instrumentName ?? "", m.instrumentType ?? ""),
    });
  }

  return items;
}
