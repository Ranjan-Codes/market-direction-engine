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

export interface IGSentiment {
  longPositionPercentage: number;
  shortPositionPercentage: number;
}

/* ── Auth ─────────────────────────────────────────────────────────────── */

let cachedSession: { session: IGSession; expiresAt: number } | null = null;

async function getSession(): Promise<IGSession> {
  const now = Date.now();
  if (cachedSession && now < cachedSession.expiresAt) {
    return cachedSession.session;
  }
  const session = await authenticate();
  cachedSession = { session, expiresAt: now + 5 * 60 * 1000 };
  return session;
}

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
  const session = await getSession();
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
  const session = await getSession();
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
  const session = await getSession();
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

/* ── Market search & client sentiment ────────────────────────────────── */

async function findIGEpic(session: IGSession, ticker: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${session.baseUrl}/markets?searchTerm=${encodeURIComponent(ticker)}`,
      { headers: authHeaders(session) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const match = (data.markets ?? []).find(
      (m: Record<string, unknown>) => m.instrumentType === "SHARES",
    );
    return (match?.epic as string) ?? null;
  } catch {
    return null;
  }
}

async function fetchSentimentBulk(
  session: IGSession,
  ids: string[],
): Promise<Map<string, IGSentiment>> {
  if (ids.length === 0) return new Map();
  try {
    const res = await fetch(
      `${session.baseUrl}/clientsentiment?marketIds=${ids.join(",")}`,
      { headers: authHeaders(session) },
    );
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map<string, IGSentiment>();
    for (const s of data.clientSentiments ?? []) {
      if (s.longPositionPercentage != null) {
        map.set(s.marketId, {
          longPositionPercentage: s.longPositionPercentage,
          shortPositionPercentage: s.shortPositionPercentage,
        });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function getIGEnrichment(
  symbols: string[],
): Promise<Map<string, IGSentiment>> {
  if (!isIGConfigured() || symbols.length === 0) return new Map();

  try {
    const session = await getSession();

    const epicResults = await Promise.all(
      symbols.map(async (sym) => {
        const ticker = sym.replace(/\.(L|DE|PA|HK)$/, "");
        const epic = await findIGEpic(session, ticker);
        return epic ? { symbol: sym, epic } : null;
      }),
    );

    const found = epicResults.filter(Boolean) as { symbol: string; epic: string }[];
    if (found.length === 0) return new Map();

    const sentimentMap = await fetchSentimentBulk(
      session,
      found.map((f) => f.epic),
    );

    const result = new Map<string, IGSentiment>();
    for (const f of found) {
      const sentiment = sentimentMap.get(f.epic);
      if (sentiment) {
        result.set(f.symbol, sentiment);
      }
    }

    return result;
  } catch {
    return new Map();
  }
}
