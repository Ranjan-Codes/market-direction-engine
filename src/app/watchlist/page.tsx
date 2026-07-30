import Link from "next/link";
import { getWatchlist, type WatchlistEntry } from "../../lib/data/watchlist";
import { getFundamentals, type Fundamentals } from "../../lib/providers/yahoo-quote";
import { WatchStar } from "../../components/watch-star";
import { AddStock } from "./add-stock";

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
  const w = 48, h = 20;
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

function FactorBars({ factors }: { factors: Record<string, number | null> | null }) {
  if (!factors) return null;
  const entries = Object.entries(factors).filter(([, v]) => v != null) as [string, number][];
  if (entries.length === 0) return null;
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  return (
    <div className="space-y-1">
      {entries.map(([key, val]) => {
        const pct = Math.min(Math.abs(val) * 100, 100);
        const positive = val > 0;
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-[9px] font-medium text-zinc-500 dark:text-zinc-400 w-10 text-right shrink-0">
              {FACTOR_LABELS[key] ?? key}
            </span>
            <div className="flex-1 h-1.5 bg-zinc-200/60 dark:bg-zinc-700/60 rounded-full overflow-hidden relative">
              <div
                className={`absolute h-full rounded-full ${positive ? "bg-emerald-500" : "bg-red-500"}`}
                style={{ width: `${pct}%`, left: positive ? 0 : undefined, right: positive ? undefined : 0 }}
              />
            </div>
            <span className={`text-[9px] tabular-nums w-7 ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {val > 0 ? "+" : ""}{val.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatGauge({ label, value, max, unit, color }: {
  label: string; value: number | null; max: number; unit?: string; color?: string;
}) {
  if (value == null) return null;
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const c = color ?? (value / max > 0.7 ? "bg-red-500" : value / max < 0.3 ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-500");
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-1 mb-0.5">
        <span className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase">{label}</span>
        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">{value.toFixed(0)}{unit ?? ""}</span>
      </div>
      <div className="h-1 bg-zinc-200/60 dark:bg-zinc-700/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${c}`} style={{ width: `${pct}%` }} />
      </div>
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {order.filter((v) => counts[v]).map((v) => {
        const cfg = VERDICT_CFG[v];
        return (
          <div key={v} className={`border ${cfg.badge} rounded-lg px-3 py-2 text-center`}>
            <div className="text-lg font-bold">{counts[v]}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider">{labels[v]}</div>
          </div>
        );
      })}
      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-center bg-zinc-50/50 dark:bg-zinc-800/30">
        <div className="text-lg font-bold text-zinc-800 dark:text-zinc-200">{avgConviction.toFixed(0)}</div>
        <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Avg conviction</div>
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
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase border rounded px-1.5 py-px ${cls}`}>
      {label}
      {mean != null && <span className="font-normal opacity-70">({mean.toFixed(1)})</span>}
    </span>
  );
}

function FundamentalsPanel({ f, price }: { f: Fundamentals; price: number | null }) {
  const currentPrice = price ?? f.regularMarketPrice;
  const upside = currentPrice && f.targetMeanPrice
    ? ((f.targetMeanPrice - currentPrice) / currentPrice) * 100
    : null;

  return (
    <div className="px-4 pb-3">
      <div className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Fundamentals</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[11px]">
        {/* Analyst Target */}
        {f.targetMeanPrice != null && (
          <div>
            <span className="text-zinc-400 dark:text-zinc-500">Target</span>
            <span className="ml-1 font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              ${f.targetMeanPrice.toFixed(0)}
            </span>
            {upside != null && (
              <span className={`ml-1 text-[10px] font-semibold tabular-nums ${upside >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {upside >= 0 ? "+" : ""}{upside.toFixed(0)}%
              </span>
            )}
            {f.targetLowPrice != null && f.targetHighPrice != null && (
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 ml-1">
                ({f.targetLowPrice.toFixed(0)}–{f.targetHighPrice.toFixed(0)})
              </span>
            )}
          </div>
        )}

        {/* Recommendation */}
        {f.recommendationKey && (
          <div className="flex items-center gap-1.5">
            <RecBadge rec={f.recommendationKey} mean={f.recommendationMean} />
            {f.numberOfAnalystOpinions != null && (
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{f.numberOfAnalystOpinions} analysts</span>
            )}
          </div>
        )}

        {/* Dividend */}
        {f.dividendYield != null && (
          <div>
            <span className="text-zinc-400 dark:text-zinc-500">Div yield</span>
            <span className="ml-1 font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {f.dividendYield.toFixed(2)}%
            </span>
            {f.trailingAnnualDividendRate != null && (
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 ml-1">(${f.trailingAnnualDividendRate.toFixed(2)}/yr)</span>
            )}
          </div>
        )}

        {/* P/E */}
        {f.trailingPE != null && (
          <div>
            <span className="text-zinc-400 dark:text-zinc-500">P/E</span>
            <span className="ml-1 font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{f.trailingPE.toFixed(1)}</span>
            {f.forwardPE != null && (
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 ml-1">fwd {f.forwardPE.toFixed(1)}</span>
            )}
          </div>
        )}

        {/* EPS */}
        {f.epsTrailingTwelveMonths != null && (
          <div>
            <span className="text-zinc-400 dark:text-zinc-500">EPS</span>
            <span className="ml-1 font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">${f.epsTrailingTwelveMonths.toFixed(2)}</span>
            {f.epsForward != null && (
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 ml-1">fwd ${f.epsForward.toFixed(2)}</span>
            )}
          </div>
        )}

        {/* Price-to-Book */}
        {f.priceToBook != null && (
          <div>
            <span className="text-zinc-400 dark:text-zinc-500">P/B</span>
            <span className="ml-1 font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{f.priceToBook.toFixed(1)}</span>
            {f.bookValue != null && (
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 ml-1">(BV ${f.bookValue.toFixed(1)})</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StockCard({ e, fund }: { e: WatchlistEntry; fund?: Fundamentals }) {
  const cfg = VERDICT_CFG[e.suggestion.verdict] ?? VERDICT_CFG.mixed;
  const changed = e.prev_direction && e.direction && e.prev_direction !== e.direction;

  return (
    <div className={`border border-zinc-200 dark:border-zinc-700 ${cfg.border} border-l-[4px] rounded-xl bg-card shadow-sm overflow-hidden`}>
      {/* Header row */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/stock/${encodeURIComponent(e.symbol)}`} className="text-base font-bold text-zinc-900 dark:text-zinc-100 hover:underline">
                {e.symbol}
              </Link>
              <span className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{e.name ?? ""}</span>
              {changed && (
                <span className="px-1.5 py-px rounded text-[8px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 uppercase">
                  flip
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {e.close != null && (
                <span className="text-lg font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">
                  {e.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
              {e.change_pct != null && (
                <span className={`text-sm font-semibold tabular-nums ${e.change_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {e.change_pct >= 0 ? "+" : ""}{(e.change_pct * 100).toFixed(2)}%
                </span>
              )}
              <MiniSparkline prices={e.spark_prices} />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              {e.index_symbol && <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 block">{e.index_symbol}</span>}
              {e.sector && <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block truncate max-w-20">{e.sector}</span>}
              {e.market_cap != null && <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block">{fmtCap(e.market_cap)}</span>}
            </div>
            <WatchStar symbol={e.symbol} inList={true} />
          </div>
        </div>
      </div>

      {/* Verdict banner */}
      <div className={`mx-4 mb-3 rounded-lg px-3 py-2 ${cfg.bg}`}>
        <div className="flex items-start gap-2">
          <span className={`text-sm ${cfg.text} shrink-0 mt-0.5`}>{cfg.icon}</span>
          <div>
            <div className={`text-xs font-semibold ${cfg.text}`}>{e.suggestion.headline}</div>
            {e.suggestion.evidence.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {e.suggestion.evidence.map((ev, i) => (
                  <li key={i} className="text-[11px] text-zinc-600 dark:text-zinc-400 flex gap-1.5">
                    <span className="text-zinc-400 dark:text-zinc-600 shrink-0">•</span>
                    <span>{ev}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Body: factors + stats side by side */}
      <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Factor breakdown */}
        <div>
          <div className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Signal Factors</div>
          <FactorBars factors={e.factors} />
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs font-semibold ${
              e.direction === "bullish" ? "text-emerald-700 dark:text-emerald-400" : e.direction === "bearish" ? "text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"
            }`}>
              {e.direction ?? "–"}
            </span>
            {e.conviction != null && (
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">conv {Math.round(e.conviction)}%</span>
            )}
            {e.gated && <span className="text-[9px] px-1 py-px rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">gated</span>}
            {e.event_blackout && <span className="text-[9px] px-1 py-px rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">blackout</span>}
          </div>
        </div>

        {/* Key stats */}
        <div>
          <div className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Key Stats</div>
          <div className="space-y-2">
            <StatGauge label="RSI" value={e.rsi_14} max={100}
              color={e.rsi_14 != null && e.rsi_14 > 70 ? "bg-red-500" : e.rsi_14 != null && e.rsi_14 < 30 ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-500"} />
            <StatGauge label="52w Range" value={e.pos_52w_range != null ? e.pos_52w_range * 100 : null} max={100} unit="%"
              color={e.pos_52w_range != null && e.pos_52w_range > 0.8 ? "bg-emerald-500" : e.pos_52w_range != null && e.pos_52w_range < 0.2 ? "bg-red-500" : "bg-zinc-400 dark:bg-zinc-500"} />
            {e.mansfield_rs != null && (
              <div className="flex items-baseline justify-between">
                <span className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase">Mansfield RS</span>
                <span className={`text-xs font-bold tabular-nums ${e.mansfield_rs > 0 ? "text-emerald-600 dark:text-emerald-400" : e.mansfield_rs < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}>
                  {e.mansfield_rs > 0 ? "+" : ""}{e.mansfield_rs.toFixed(2)}
                </span>
              </div>
            )}
            {e.conviction != null && (
              <StatGauge label="Conviction" value={e.conviction} max={100} unit="%"
                color={e.conviction > 70 ? "bg-sky-500" : e.conviction > 40 ? "bg-zinc-400 dark:bg-zinc-500" : "bg-zinc-300 dark:bg-zinc-600"} />
            )}
          </div>
        </div>
      </div>

      {/* Fundamentals */}
      {fund && <FundamentalsPanel f={fund} price={e.close} />}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-800/20">
        <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
          as of {e.week_end ?? "–"} · added {e.added_at?.slice(0, 10) ?? "–"}
        </div>
        <Link href={`/stock/${encodeURIComponent(e.symbol)}`}
          className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
          full chart →
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
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Watchlist
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
          {entries.length} names · leading-indicator verdicts at the 2–6 week horizon · add <b>any listed
          stock</b> below (any exchange), or star index names in the{" "}
          <Link href="/screener" className="underline">screener</Link> ·{" "}
          <a href="/api/export/watchlist" className="underline">export CSV</a> ·{" "}
          <Link href="/report" className="underline">print report</Link>
        </p>
      </header>

      <AddStock inList={entries.map((e) => e.symbol)} />

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
          {/* Verdict summary */}
          <VerdictSummary entries={entries} />

          {/* Stock cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {entries.map((e) => (
              <StockCard key={e.symbol} e={e} fund={fundMap.get(e.symbol)} />
            ))}
          </div>

          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 pb-4">
            Verdicts use leading indicators only (weekly RSI stretch, Bollinger band position, divergence, index gauge).
            Signal factors show the 7-factor composite that drives direction. FLIP = signal changed in the last 7 days.
          </p>
        </>
      )}
    </div>
  );
}
