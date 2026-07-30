import Link from "next/link";
import {
  getRegimes, getDataHealth, getIndexTechnicals, getConstituentBreadth,
  getIndexDailyPrices, getTopConstituents, type TopConstituent,
} from "../lib/data/queries";
import { getWatchlist } from "../lib/data/watchlist";
import { Sparkline } from "../components/ui";
import { TopTable } from "../components/top-table";
import { Collapsible } from "../components/collapsible";
import { SectorHeatmap } from "../components/sector-heatmap";
import {
  marketVerdict, buildInsights, TONE_STYLE,
  interpretIndicators, type IndicatorReading,
} from "../lib/plain";

export const dynamic = "force-dynamic";

/* ── Signal colour mapping ───────────────────────────────────────────── */

const SIG = {
  bullish: { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", left: "border-l-emerald-500", bg: "bg-emerald-50/60 dark:bg-emerald-950/30" },
  bearish: { bar: "bg-red-500", text: "text-red-700 dark:text-red-400", left: "border-l-red-500", bg: "bg-red-50/60 dark:bg-red-950/30" },
  caution: { bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", left: "border-l-amber-500", bg: "bg-amber-50/60 dark:bg-amber-950/30" },
  neutral: { bar: "bg-zinc-300 dark:bg-zinc-600", text: "text-zinc-500 dark:text-zinc-400", left: "border-l-zinc-300 dark:border-l-zinc-600", bg: "bg-zinc-50/60 dark:bg-zinc-800/40" },
};

/* ── Components ──────────────────────────────────────────────────────── */

function IndicatorTile({ ind }: { ind: IndicatorReading }) {
  const c = SIG[ind.signal];
  return (
    <div className={`rounded-lg border border-zinc-200/80 dark:border-zinc-700/60 ${c.left} border-l-[3px] px-2.5 py-2 ${c.bg}`}>
      <div className="flex items-baseline justify-between gap-1">
        <div className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider truncate">{ind.name}</div>
        <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 shrink-0">{ind.confidence}%</span>
      </div>
      <div className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{ind.value}</div>
      <div className={`text-[11px] font-medium ${c.text}`}>{ind.reading}</div>
      <div className="mt-1 h-1 bg-zinc-200/60 dark:bg-zinc-700/60 rounded-full overflow-hidden">
        <div className={`h-full ${c.bar} rounded-full`} style={{ width: `${ind.confidence}%` }} />
      </div>
    </div>
  );
}

function FearGreedMeter({ score }: { score: number }) {
  const label =
    score >= 80 ? "Extreme Greed" : score >= 60 ? "Greed"
    : score >= 50 ? "Mild Greed" : score >= 40 ? "Mild Fear"
    : score >= 20 ? "Fear" : "Extreme Fear";
  const color =
    score >= 60 ? "text-emerald-700 dark:text-emerald-400" : score >= 40 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400";
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-lg font-bold ${color}`}>{score}</span>
        <span className={`text-[11px] font-semibold ${color}`}>{label}</span>
      </div>
      <div
        className="h-1.5 rounded-full mt-1 relative"
        style={{ background: "linear-gradient(to right, #dc2626, #f59e0b, #22c55e)" }}
      >
        <div
          className="absolute w-2.5 h-2.5 rounded-full bg-white dark:bg-zinc-900 border-2 border-zinc-800 dark:border-zinc-200 -top-[2px] shadow-sm"
          style={{ left: `calc(${score}% - 5px)` }}
        />
      </div>
    </div>
  );
}

function GaugeBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-1 mb-0.5">
        <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</span>
        <span className={`text-sm font-bold ${color}`}>{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 bg-zinc-200/60 dark:bg-zinc-700/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color.includes("emerald") ? "bg-emerald-500" : color.includes("red") ? "bg-red-500" : color.includes("amber") ? "bg-amber-500" : "bg-zinc-400 dark:bg-zinc-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PctGauge({ value, label, sub, invertDanger }: { value: number | null; label: string; sub?: string; invertDanger?: boolean }) {
  if (value == null) return (
    <div>
      <div className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="text-base font-bold text-zinc-500">–</div>
    </div>
  );
  const danger = invertDanger ? value < 40 : value > 60;
  const safe = invertDanger ? value > 60 : value < 40;
  const color = danger ? "text-red-700 dark:text-red-400" : safe ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-900 dark:text-zinc-100";
  const barColor = danger ? "bg-red-500" : safe ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-500";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-1 mb-0.5">
        <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</span>
        <span className={`text-sm font-bold ${color}`}>{value.toFixed(0)}%</span>
      </div>
      {sub && <div className="text-[10px] text-zinc-500 dark:text-zinc-400 -mt-0.5 mb-0.5">{sub}</div>}
      <div className="h-1.5 bg-zinc-200/60 dark:bg-zinc-700/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default async function TodayPage() {
  const [allRegimes, watchlist, health, techMap, breadthMap, dailyMap, topMap] = await Promise.all([
    getRegimes(), getWatchlist(), getDataHealth(), getIndexTechnicals(),
    getConstituentBreadth(), getIndexDailyPrices(), getTopConstituents(20),
  ]);
  const regimes = allRegimes.filter((r) => r.symbol !== "NDX");
  const stale = health.freshness.filter((f: { days_behind: number }) => f.days_behind > 4);
  const flagged = watchlist.filter(
    (e) => e.suggestion.verdict === "overbought-risk" || e.suggestion.verdict === "oversold-setup",
  );
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 py-4 px-3">
      {/* Header */}
      <header className="space-y-1">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{today}</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Market Direction Engine</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Technical indicators with confidence levels per index — each reading shows how strongly the
          indicator leans bullish or bearish. Click <b>full detail</b> on any index for deeper evidence.{" "}
          <Link href="/guide" className="underline text-zinc-700 dark:text-zinc-300">New here? Read the guide.</Link>
        </p>
      </header>

      {stale.length > 0 && (
        <div className="border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-sm px-4 py-3 rounded-lg shadow-sm">
          Some data is stale ({stale.map((s: { item: string }) => s.item).join(", ")}) — read
          today&apos;s readings with caution.
        </div>
      )}

      {/* Index cards — side by side at xl+ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {regimes.map((r) => {
          const g = r.breakdown.gauge;
          const v = marketVerdict(r.regime, g.direction, g.intensity);
          const style = TONE_STYLE[v.tone];
          const tech = techMap.get(r.symbol);
          const daily = dailyMap.get(r.symbol);
          const topStocks = topMap.get(r.symbol) ?? [];
          const indicators = tech ? interpretIndicators(tech) : [];
          const catalysts = r.breakdown.catalysts.slice(0, 3);
          const cb = breadthMap.get(r.symbol);

          const posInputs = r.breakdown.inputs.positioning ?? {};
          const breadthInputs = r.breakdown.inputs.breadth ?? {};
          const vix = typeof posInputs.vix === "number" ? posInputs.vix : null;
          const vixPctile = typeof posInputs.vixPctile === "number" ? posInputs.vixPctile : null;
          const pctAbove200d = typeof breadthInputs.pctAbove200d === "number" ? breadthInputs.pctAbove200d : null;

          const vixColor = vixPctile != null && vixPctile > 80
            ? "text-red-700 dark:text-red-400"
            : vixPctile != null && vixPctile < 20
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-zinc-900 dark:text-zinc-100";

          return (
            <div
              key={r.symbol}
              className={`border ${style.border} dark:border-zinc-700 rounded-2xl bg-card shadow-sm overflow-hidden flex flex-col`}
            >
              {/* Card header */}
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{r.name}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${style.chip}`}>
                        {r.regime === "risk_on" ? "supportive" : r.regime === "risk_off" ? "hostile" : "mixed"}
                      </span>
                    </div>
                    {daily?.close != null ? (
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-lg font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">
                          {daily.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {daily.change != null && daily.change_pct != null && (
                          <span className={`text-sm font-semibold tabular-nums ${daily.change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {daily.change >= 0 ? "+" : ""}{daily.change.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {" "}({daily.change_pct >= 0 ? "+" : ""}{(daily.change_pct * 100).toFixed(2)}%)
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{daily.trade_date}</span>
                      </div>
                    ) : tech?.close != null ? (
                      <span className="text-lg font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">
                        {tech.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <Sparkline values={r.history.map((h) => h.composite)} baseline={50} width={100} height={28} />
                    <div className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-0.5">12-mo regime</div>
                  </div>
                </div>
                <p className={`text-sm font-semibold ${style.text} mt-1`}>{v.headline}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{v.sub}</p>
              </div>

              {/* Market Pulse — visual gauges */}
              <div className="mx-4 mb-3 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50/50 dark:bg-zinc-800/30 p-3">
                <Collapsible title="Market Pulse">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">
                        Fear &amp; Greed
                      </div>
                      <FearGreedMeter score={r.composite_score} />
                    </div>

                    {vix != null ? (
                      <GaugeBar
                        value={vix}
                        max={50}
                        color={vixColor}
                        label="VIX"
                      />
                    ) : (
                      <div>
                        <div className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">VIX</div>
                        <div className="text-base font-bold text-zinc-500">–</div>
                      </div>
                    )}

                    <PctGauge
                      value={pctAbove200d}
                      label="Above 200d MA"
                      sub="of members"
                    />

                    <PctGauge
                      value={cb ? cb.pct_overbought : null}
                      label="Overbought"
                      sub={cb ? `of ${cb.total}` : undefined}
                      invertDanger
                    />

                    <PctGauge
                      value={cb ? cb.pct_oversold : null}
                      label="Oversold"
                      sub={cb ? `of ${cb.total}` : undefined}
                    />
                  </div>
                </Collapsible>
              </div>

              {/* Technical Indicators — collapsible */}
              {indicators.length > 0 && (
                <div className="mx-4 mb-3">
                  <Collapsible title="Technical Indicators">
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-2">
                      {indicators.map((ind) => (
                        <IndicatorTile key={ind.id} ind={ind} />
                      ))}
                    </div>
                  </Collapsible>
                </div>
              )}

              {/* Sector Heatmap */}
              {topStocks.length > 0 && (
                <div className="mx-4 mb-3">
                  <Collapsible title="Sector Heatmap" defaultOpen={false}>
                    <SectorHeatmap stocks={topStocks} />
                    <p className="text-[9px] text-zinc-400 dark:text-zinc-600 mt-1">
                      Size = market cap. Color = bullish (green) to bearish (red). B = bullish count, R = bearish count.
                    </p>
                  </Collapsible>
                </div>
              )}

              {/* Top 20 — interactive client component */}
              {topStocks.length > 0 && (
                <div className="mx-4 mb-3 flex-1">
                  <TopTable stocks={topStocks} indexSymbol={r.symbol} />
                </div>
              )}

              {/* Footer: catalysts + link */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-800/20 mt-auto">
                {catalysts.length > 0 ? (
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span className="text-[9px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mr-1">Coming up:</span>
                    {catalysts.map((c, i) => (
                      <span key={i}>
                        {c.event_name.replace("Earnings: ", "")} {c.release_at.slice(5, 10).replace("-", "/")}
                        {i < catalysts.length - 1 ? " · " : ""}
                      </span>
                    ))}
                  </div>
                ) : <div />}
                <Link
                  href={`/market/${r.symbol}`}
                  className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                >
                  full detail →
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Weekly insights + watchlist — full width below the cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {(() => {
          const insights = buildInsights(regimes);
          if (insights.length === 0) return null;
          return (
            <div className="border border-zinc-200 dark:border-zinc-700 rounded-2xl p-4 bg-card shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">This week&apos;s insights</h2>
              <ul className="space-y-1.5">
                {insights.map((ins, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className={
                      ins.tone === "good" ? "text-emerald-600 dark:text-emerald-400" : ins.tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-zinc-400 dark:text-zinc-500"
                    }>
                      {ins.tone === "good" ? "▲" : ins.tone === "warn" ? "▼" : "•"}
                    </span>
                    <span className="text-zinc-700 dark:text-zinc-300">{ins.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {flagged.length > 0 && (
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-2xl p-4 bg-card shadow-sm flex items-start">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-semibold">On your watchlist:</span>{" "}
              {flagged.map((e, i) => (
                <span key={e.symbol}>
                  <Link href={`/stock/${encodeURIComponent(e.symbol)}`} className="underline">
                    {e.symbol}
                  </Link>{" "}
                  {e.suggestion.verdict === "overbought-risk" ? "looks stretched" : "looks washed out"}
                  {i < flagged.length - 1 ? ", " : ""}
                </span>
              ))}
              {" — "}
              <Link href="/watchlist" className="underline">see why →</Link>
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500 pb-4">
        Readings are probabilistic, not predictions. Deeper layers:{" "}
        <Link href="/screener" className="underline">stock signals</Link> ·{" "}
        <Link href="/calendar" className="underline">calendar</Link> ·{" "}
        <Link href="/more" className="underline">analytics &amp; settings</Link>
      </p>
    </div>
  );
}
