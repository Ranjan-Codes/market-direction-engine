import Link from "next/link";
import { getWatchlist, type WatchlistEntry } from "../../lib/data/watchlist";
import { getFundamentals, type Fundamentals } from "../../lib/providers/yahoo-quote";
import { WatchStar } from "../../components/watch-star";
import { AddStock } from "./add-stock";
import { ImportPortfolio } from "./import-portfolio";

export const dynamic = "force-dynamic";

/* ── Verdict styles ──────────────────────────────────────────────────── */

const VERDICT_CFG: Record<string, {
  border: string; bg: string; text: string; badge: string; icon: string;
}> = {
  "overbought-risk": {
    border: "border-l-red-500",
    bg: "bg-red-50/60 dark:bg-red-950/20",
    text: "text-red-800 dark:text-red-300",
    badge: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800",
    icon: "▼",
  },
  "oversold-setup": {
    border: "border-l-emerald-500",
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    text: "text-emerald-800 dark:text-emerald-300",
    badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
    icon: "▲",
  },
  constructive: {
    border: "border-l-sky-500",
    bg: "bg-sky-50/40 dark:bg-sky-950/10",
    text: "text-sky-800 dark:text-sky-300",
    badge: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-800",
    icon: "●",
  },
  weak: {
    border: "border-l-orange-500",
    bg: "bg-orange-50/40 dark:bg-orange-950/10",
    text: "text-orange-800 dark:text-orange-300",
    badge: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800",
    icon: "◆",
  },
  mixed: {
    border: "border-l-zinc-400 dark:border-l-zinc-600",
    bg: "bg-zinc-50/40 dark:bg-zinc-800/20",
    text: "text-zinc-700 dark:text-zinc-300",
    badge: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700",
    icon: "—",
  },
};

/* ── Helpers ──────────────────────────────────────────────────────────── */

const FACTOR_LABELS: Record<string, string> = {
  trendMa: "Trend", momentum: "Mom", divergence: "Div",
  relativeStrength: "RS", volume: "Vol", bollinger: "BB", range: "Range",
};

const FACTOR_TIPS: Record<string, string> = {
  trendMa: "Trend — is the price moving up or down over recent weeks?",
  momentum: "Momentum — how fast is the price changing?",
  divergence: "Divergence — is momentum disagreeing with the price direction? (a warning sign)",
  relativeStrength: "Relative Strength — is this stock doing better or worse than its index?",
  volume: "Volume — is trading activity supporting the price move?",
  bollinger: "Bollinger Bands — is the price stretched too far from its average?",
  range: "Range — where does the price sit in its recent trading range?",
};

function fmtCap(v: number | null): string {
  if (v == null) return "";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

/* ── Sub-components ───────────────────────────────────────────────────── */

function MiniSparkline({ prices }: { prices: number[] | null }) {
  if (!prices || prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const w = 40, h = 16;
  const pts = prices
    .map((v, i) => `${((i / (prices.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(" ");
  const up = prices[prices.length - 1] >= prices[0];
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke={up ? "#10b981" : "#ef4444"} strokeWidth={1.5} />
    </svg>
  );
}

function FactorChips({ factors }: { factors: Record<string, number | null> | null }) {
  if (!factors) return null;
  const entries = Object.entries(factors).filter(([, v]) => v != null) as [string, number][];
  if (entries.length === 0) return null;
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  return (
    <div className="flex flex-wrap gap-1">
      {entries.slice(0, 4).map(([key, val]) => {
        const positive = val > 0;
        return (
          <span
            key={key}
            className={`text-[8px] font-medium px-1.5 py-px rounded tabular-nums cursor-help ${
              positive
                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400"
            }`}
            title={FACTOR_TIPS[key] ?? ""}
          >
            {FACTOR_LABELS[key] ?? key} {val > 0 ? "+" : ""}{val.toFixed(2)}
          </span>
        );
      })}
      {entries.length > 4 && (
        <span className="text-[8px] text-zinc-400 dark:text-zinc-500">+{entries.length - 4}</span>
      )}
    </div>
  );
}

function VerdictSummary({ entries }: { entries: WatchlistEntry[] }) {
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.suggestion.verdict] = (counts[e.suggestion.verdict] || 0) + 1;
  const order = ["overbought-risk", "oversold-setup", "constructive", "weak", "mixed"];
  const labels: Record<string, string> = {
    "overbought-risk": "Overbought", "oversold-setup": "Oversold",
    constructive: "Constructive", weak: "Weak", mixed: "Mixed",
  };
  const avgConviction = entries.reduce((s, e) => s + (e.conviction ?? 0), 0) / (entries.length || 1);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {order.filter((v) => counts[v]).map((v) => {
        const cfg = VERDICT_CFG[v];
        return (
          <div key={v} className={`inline-flex items-center gap-1.5 border ${cfg.badge} rounded-md px-2.5 py-1`}>
            <span className="text-sm font-bold">{counts[v]}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider">{labels[v]}</span>
          </div>
        );
      })}
      <div className="inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 rounded-md px-2.5 py-1 bg-zinc-50/50 dark:bg-zinc-800/30">
        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{avgConviction.toFixed(0)}</span>
        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Avg conviction</span>
      </div>
    </div>
  );
}

function RecBadge({ rec, mean }: { rec: string | null; mean: number | null }) {
  if (!rec) return null;
  const key = rec.toLowerCase();
  const cls =
    key === "buy" || key === "strong_buy"
      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700"
      : key === "sell" || key === "strong_sell"
        ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700"
        : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700";
  const label = rec.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold uppercase border rounded px-1 py-px ${cls}`}>
      {label}
      {mean != null && <span className="font-normal opacity-70">({mean.toFixed(1)})</span>}
    </span>
  );
}

function CompactFundamentals({ f, price }: { f: Fundamentals; price: number | null }) {
  const currentPrice = price ?? f.regularMarketPrice;
  const upside = currentPrice && f.targetMeanPrice
    ? ((f.targetMeanPrice - currentPrice) / currentPrice) * 100
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
      {f.targetMeanPrice != null && (
        <span title="The average price analysts expect this stock to reach" className="cursor-help">
          <span className="text-zinc-400 dark:text-zinc-500">Tgt</span>{" "}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">${f.targetMeanPrice.toFixed(0)}</span>
          {upside != null && (
            <span className={`ml-0.5 font-semibold tabular-nums ${upside >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {upside >= 0 ? "+" : ""}{upside.toFixed(0)}%
            </span>
          )}
        </span>
      )}
      {f.recommendationKey && <RecBadge rec={f.recommendationKey} mean={f.recommendationMean} />}
      {f.trailingPE != null && (
        <span title="Price-to-Earnings — lower usually means cheaper" className="cursor-help">
          <span className="text-zinc-400 dark:text-zinc-500">P/E</span>{" "}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{f.trailingPE.toFixed(1)}</span>
        </span>
      )}
      {f.epsTrailingTwelveMonths != null && (
        <span title="Earnings Per Share — how much profit per share" className="cursor-help">
          <span className="text-zinc-400 dark:text-zinc-500">EPS</span>{" "}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">${f.epsTrailingTwelveMonths.toFixed(2)}</span>
        </span>
      )}
      {f.dividendYield != null && (
        <span title="Dividend Yield — yearly payout as % of share price" className="cursor-help">
          <span className="text-zinc-400 dark:text-zinc-500">Div</span>{" "}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{f.dividendYield.toFixed(2)}%</span>
        </span>
      )}
      {f.priceToBook != null && (
        <span title="Price-to-Book — below 1.0 means trading below asset value" className="cursor-help">
          <span className="text-zinc-400 dark:text-zinc-500">P/B</span>{" "}
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{f.priceToBook.toFixed(1)}</span>
        </span>
      )}
    </div>
  );
}

function StockCard({ e, fund }: { e: WatchlistEntry; fund?: Fundamentals }) {
  const cfg = VERDICT_CFG[e.suggestion.verdict] ?? VERDICT_CFG.mixed;
  const changed = e.prev_direction && e.direction && e.prev_direction !== e.direction;

  return (
    <div className={`border border-zinc-200 dark:border-zinc-700 ${cfg.border} border-l-[3px] rounded-lg bg-card shadow-sm overflow-hidden`}>
      {/* Header: symbol + price on one tight row */}
      <div className="px-3 pt-2 pb-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link href={`/stock/${encodeURIComponent(e.symbol)}`} className="text-sm font-bold text-zinc-900 dark:text-zinc-100 hover:underline shrink-0">
              {e.symbol}
            </Link>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{e.name ?? ""}</span>
            {changed && (
              <span className="px-1 py-px rounded text-[7px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 uppercase shrink-0">
                flip
              </span>
            )}
          </div>
          <WatchStar symbol={e.symbol} inList={true} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {e.close != null && (
            <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {e.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {e.change_pct != null && (
            <span className={`text-[11px] font-semibold tabular-nums ${e.change_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {e.change_pct >= 0 ? "+" : ""}{(e.change_pct * 100).toFixed(2)}%
            </span>
          )}
          <MiniSparkline prices={e.spark_prices} />
          <span className="ml-auto text-[9px] text-zinc-400 dark:text-zinc-500 shrink-0">
            {[e.sector, fmtCap(e.market_cap)].filter(Boolean).join(" · ")}
          </span>
        </div>
      </div>

      {/* Verdict: single compact line */}
      <div className={`mx-3 mb-2 rounded-md px-2 py-1.5 ${cfg.bg}`}>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs ${cfg.text} shrink-0`}>{cfg.icon}</span>
          <span className={`text-[11px] font-semibold ${cfg.text} line-clamp-1`}>{e.suggestion.headline}</span>
        </div>
      </div>

      {/* Direction + confidence + flags inline */}
      <div className="px-3 pb-1.5 flex items-center gap-1.5 flex-wrap">
        <span
          title={e.direction === "bullish" ? "Indicators suggest the price is likely to rise" : e.direction === "bearish" ? "Indicators suggest the price is likely to fall" : "No clear direction — signals are mixed"}
          className={`text-[11px] font-bold cursor-help ${
            e.direction === "bullish" ? "text-emerald-700 dark:text-emerald-400" : e.direction === "bearish" ? "text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          {e.direction ?? "–"}
        </span>
        {e.conviction != null && (
          <span title="How confident the system is in this signal — higher means stronger evidence" className="text-[10px] text-zinc-500 dark:text-zinc-400 cursor-help">
            {Math.round(e.conviction)}%
          </span>
        )}
        {e.gated && <span title="The overall market mood is strong, so this bearish signal is held back" className="text-[8px] px-1 py-px rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-help">gated</span>}
        {e.event_blackout && <span title="Earnings report is coming soon — signals are less reliable around earnings" className="text-[8px] px-1 py-px rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 cursor-help">earnings soon</span>}
      </div>

      {/* Top signal factors as compact chips */}
      <div className="px-3 pb-1.5">
        <FactorChips factors={e.factors} />
      </div>

      {/* Key stats: single inline row */}
      <div className="px-3 pb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
        {e.rsi_14 != null && (
          <span title="RSI — overbought above 70, oversold below 30" className="cursor-help">
            <span className="text-zinc-400 dark:text-zinc-500">RSI</span>{" "}
            <span className={`font-bold tabular-nums ${e.rsi_14 > 70 ? "text-red-600 dark:text-red-400" : e.rsi_14 < 30 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-800 dark:text-zinc-200"}`}>
              {e.rsi_14.toFixed(0)}
            </span>
          </span>
        )}
        {e.pos_52w_range != null && (
          <span title="Where the price sits in its 52-week range — 100% = near yearly high" className="cursor-help">
            <span className="text-zinc-400 dark:text-zinc-500">52w</span>{" "}
            <span className="font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">{(e.pos_52w_range * 100).toFixed(0)}%</span>
          </span>
        )}
        {e.mansfield_rs != null && (
          <span title="Mansfield RS — positive = outperforming the index" className="cursor-help">
            <span className="text-zinc-400 dark:text-zinc-500">RS</span>{" "}
            <span className={`font-bold tabular-nums ${e.mansfield_rs > 0 ? "text-emerald-600 dark:text-emerald-400" : e.mansfield_rs < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-800 dark:text-zinc-200"}`}>
              {e.mansfield_rs > 0 ? "+" : ""}{e.mansfield_rs.toFixed(2)}
            </span>
          </span>
        )}
      </div>

      {/* Fundamentals: compact inline */}
      {fund && (
        <div className="px-3 pb-1.5">
          <CompactFundamentals f={fund} price={e.close} />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-800/20">
        <span className="text-[9px] text-zinc-400 dark:text-zinc-500">
          {e.week_end ?? "–"}
        </span>
        <Link href={`/stock/${encodeURIComponent(e.symbol)}`}
          className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
          chart →
        </Link>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default async function WatchlistPage() {
  const entries = await getWatchlist();
  const fundMap = entries.length > 0
    ? await getFundamentals(entries.map((e) => e.symbol))
    : new Map<string, Fundamentals>();

  return (
    <div className="space-y-3 max-w-[1600px] mx-auto">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Watchlist
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          {entries.length} names · 2–6 week horizon · add <b>any listed stock</b> below ·{" "}
          <Link href="/screener" className="underline">screener</Link> ·{" "}
          <a href="/api/export/watchlist" className="underline">CSV</a> ·{" "}
          <Link href="/report" className="underline">report</Link>
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-3">
        <AddStock inList={entries.map((e) => e.symbol)} />
        <ImportPortfolio inList={entries.map((e) => e.symbol)} />
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-card shadow-sm">
          <div className="text-3xl mb-2">★</div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Empty. Star names in the <Link href="/screener" className="underline">screener</Link> to track how
            the leading indicators read them.
          </p>
        </div>
      ) : (
        <>
          <VerdictSummary entries={entries} />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {entries.map((e) => (
              <StockCard key={e.symbol} e={e} fund={fundMap.get(e.symbol)} />
            ))}
          </div>

          <p className="text-[9px] text-zinc-400 dark:text-zinc-500 pb-2">
            Verdicts use leading indicators only. Signal factors show the 7-factor composite. FLIP = signal changed in the last 7 days. Hover any label for explanation.
          </p>
        </>
      )}
    </div>
  );
}
