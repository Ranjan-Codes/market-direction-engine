import Link from "next/link";
import {
  getRegimes, getDataHealth, getIndexTechnicals, getConstituentBreadth,
  getIndexDailyPrices, getTopConstituents, type TopConstituent,
} from "../lib/data/queries";
import { getWatchlist } from "../lib/data/watchlist";
import { Sparkline } from "../components/ui";
import {
  marketVerdict, buildInsights, TONE_STYLE,
  interpretIndicators, type IndicatorReading,
} from "../lib/plain";

export const dynamic = "force-dynamic";

/* ── Signal colour mapping ───────────────────────────────────────────── */

const SIG = {
  bullish: { bar: "bg-emerald-500", text: "text-emerald-700", left: "border-l-emerald-500", bg: "bg-emerald-50/60" },
  bearish: { bar: "bg-red-500", text: "text-red-700", left: "border-l-red-500", bg: "bg-red-50/60" },
  caution: { bar: "bg-amber-500", text: "text-amber-700", left: "border-l-amber-500", bg: "bg-amber-50/60" },
  neutral: { bar: "bg-zinc-300", text: "text-zinc-500", left: "border-l-zinc-300", bg: "bg-zinc-50/60" },
};

/* ── Components ──────────────────────────────────────────────────────── */

function IndicatorTile({ ind }: { ind: IndicatorReading }) {
  const c = SIG[ind.signal];
  return (
    <div className={`rounded-lg border border-zinc-200/80 ${c.left} border-l-[3px] px-2.5 py-2 ${c.bg}`}>
      <div className="flex items-baseline justify-between gap-1">
        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider truncate">{ind.name}</div>
        <span className="text-[10px] font-medium text-zinc-400 shrink-0">{ind.confidence}%</span>
      </div>
      <div className="text-base font-bold text-zinc-900 leading-tight">{ind.value}</div>
      <div className={`text-[11px] font-medium ${c.text}`}>{ind.reading}</div>
      <div className="mt-1 h-1 bg-zinc-200/60 rounded-full overflow-hidden">
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
    score >= 60 ? "text-emerald-700" : score >= 40 ? "text-amber-700" : "text-red-700";
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
          className="absolute w-2.5 h-2.5 rounded-full bg-white border-2 border-zinc-800 -top-[2px] shadow-sm"
          style={{ left: `calc(${score}% - 5px)` }}
        />
      </div>
    </div>
  );
}

function PulseMetric({
  label, value, sub, color,
}: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</div>
      <div className={`text-base font-bold ${color ?? "text-zinc-900"} leading-tight`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function fmtCap(v: number | null): string {
  if (v == null) return "–";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

const FACTOR_LABELS: Record<string, string> = {
  trendMa: "Trend",
  momentum: "Momentum",
  divergence: "Divergence",
  relativeStrength: "Rel Str",
  volume: "Volume",
  bollinger: "Bollinger",
  range: "Range",
};

function topDriver(factors: Record<string, number | null> | null): { label: string; value: number } | null {
  if (!factors) return null;
  let best: { label: string; value: number } | null = null;
  for (const [k, v] of Object.entries(factors)) {
    if (v == null) continue;
    if (!best || Math.abs(v) > Math.abs(best.value)) {
      best = { label: FACTOR_LABELS[k] ?? k, value: v };
    }
  }
  return best;
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
        <p className="text-xs text-zinc-500">{today}</p>
        <h1 className="text-2xl font-bold tracking-tight">Market Direction Engine</h1>
        <p className="text-sm text-zinc-600">
          Technical indicators with confidence levels per index — each reading shows how strongly the
          indicator leans bullish or bearish. Click <b>full detail</b> on any index for deeper evidence.{" "}
          <Link href="/guide" className="underline text-zinc-700">New here? Read the guide.</Link>
        </p>
      </header>

      {stale.length > 0 && (
        <div className="border border-amber-400 bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-lg shadow-sm">
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

          const vixLabel = vixPctile != null
            ? vixPctile < 20 ? "calm" : vixPctile < 40 ? "low" : vixPctile < 60 ? "normal"
              : vixPctile < 80 ? "elevated" : "fearful"
            : null;

          return (
            <div
              key={r.symbol}
              className={`border ${style.border} rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col`}
            >
              {/* Card header */}
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold tracking-tight">{r.name}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${style.chip}`}>
                        {r.regime === "risk_on" ? "supportive" : r.regime === "risk_off" ? "hostile" : "mixed"}
                      </span>
                    </div>
                    {daily?.close != null ? (
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-lg font-bold text-zinc-800 tabular-nums">
                          {daily.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {daily.change != null && daily.change_pct != null && (
                          <span className={`text-sm font-semibold tabular-nums ${daily.change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {daily.change >= 0 ? "+" : ""}{daily.change.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {" "}({daily.change_pct >= 0 ? "+" : ""}{(daily.change_pct * 100).toFixed(2)}%)
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-400">{daily.trade_date}</span>
                      </div>
                    ) : tech?.close != null ? (
                      <span className="text-lg font-bold text-zinc-800 tabular-nums">
                        {tech.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <Sparkline values={r.history.map((h) => h.composite)} baseline={50} width={100} height={28} />
                    <div className="text-[9px] text-zinc-400 mt-0.5">12-mo regime</div>
                  </div>
                </div>
                <p className={`text-sm font-semibold ${style.text} mt-1`}>{v.headline}</p>
                <p className="text-xs text-zinc-500">{v.sub}</p>
              </div>

              {/* Market Pulse — compact 3-col grid */}
              <div className="mx-4 mb-3 border border-zinc-200 rounded-lg bg-zinc-50/50 p-3">
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Market Pulse</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">
                      Fear &amp; Greed
                    </div>
                    <FearGreedMeter score={r.composite_score} />
                  </div>

                  <PulseMetric
                    label="VIX"
                    value={vix != null ? vix.toFixed(1) : "–"}
                    sub={vixLabel ? `${vixPctile?.toFixed(0)}th pctile` : undefined}
                    color={vixPctile != null && vixPctile > 80 ? "text-red-700" : vixPctile != null && vixPctile < 20 ? "text-emerald-700" : "text-zinc-900"}
                  />

                  <PulseMetric
                    label="Above 200d MA"
                    value={pctAbove200d != null ? `${pctAbove200d.toFixed(0)}%` : "–"}
                    sub="of members"
                    color={pctAbove200d != null && pctAbove200d > 60 ? "text-emerald-700" : pctAbove200d != null && pctAbove200d < 40 ? "text-red-700" : "text-zinc-900"}
                  />

                  <PulseMetric
                    label="Overbought"
                    value={cb ? `${cb.pct_overbought.toFixed(0)}%` : "–"}
                    sub={cb ? `of ${cb.total}` : undefined}
                    color={cb && cb.pct_overbought > 30 ? "text-amber-700" : "text-zinc-900"}
                  />

                  <PulseMetric
                    label="Oversold"
                    value={cb ? `${cb.pct_oversold.toFixed(0)}%` : "–"}
                    sub={cb ? `of ${cb.total}` : undefined}
                    color={cb && cb.pct_oversold > 30 ? "text-red-700" : "text-zinc-900"}
                  />
                </div>
              </div>

              {/* Technical Indicators — compact 2x4 grid */}
              {indicators.length > 0 && (
                <div className="mx-4 mb-3">
                  <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Technical Indicators
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-2">
                    {indicators.map((ind) => (
                      <IndicatorTile key={ind.id} ind={ind} />
                    ))}
                  </div>
                </div>
              )}

              {/* Top 20 — compact table */}
              {topStocks.length > 0 && (
                <div className="mx-4 mb-3 flex-1">
                  <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Top 20 by Market Cap
                  </h3>
                  <div className="overflow-x-auto border border-zinc-200 rounded-lg">
                    <table className="w-full text-[11px]">
                      <thead className="text-zinc-500 text-left bg-zinc-50/80">
                        <tr>
                          <th className="pl-2 pr-1 py-1.5 w-5">#</th>
                          <th className="px-1.5 py-1.5">Ticker</th>
                          <th className="px-1.5 py-1.5">Company</th>
                          <th className="px-1.5 py-1.5 text-right">Cap</th>
                          <th className="px-1.5 py-1.5 text-right">Price</th>
                          <th className="px-1.5 py-1.5 text-right">Chg%</th>
                          <th className="px-1.5 py-1.5">Signal</th>
                          <th className="px-1.5 py-1.5">Driver</th>
                          <th className="px-1.5 py-1.5 text-right">RSI</th>
                          <th className="px-1.5 py-1.5">52w</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topStocks.map((s, i) => {
                          const driver = topDriver(s.factors);
                          return (
                          <tr key={s.symbol} className="border-t border-zinc-100 hover:bg-zinc-50/60 transition-colors">
                            <td className="pl-2 pr-1 py-1 text-zinc-400">{i + 1}</td>
                            <td className="px-1.5 py-1 font-semibold">
                              <Link href={`/stock/${encodeURIComponent(s.symbol)}`} className="hover:underline">
                                {s.symbol}
                              </Link>
                            </td>
                            <td className="px-1.5 py-1 text-zinc-600 max-w-[120px] truncate">{s.name ?? "–"}</td>
                            <td className="px-1.5 py-1 text-right tabular-nums text-zinc-700">
                              {fmtCap(s.market_cap)}
                            </td>
                            <td className="px-1.5 py-1 text-right tabular-nums font-medium">
                              {s.close != null ? s.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–"}
                            </td>
                            <td className={`px-1.5 py-1 text-right tabular-nums font-medium ${
                              s.change_pct != null && s.change_pct > 0 ? "text-emerald-600" : s.change_pct != null && s.change_pct < 0 ? "text-red-600" : "text-zinc-500"
                            }`}>
                              {s.change_pct != null ? `${s.change_pct >= 0 ? "+" : ""}${(s.change_pct * 100).toFixed(1)}%` : "–"}
                            </td>
                            <td className={`px-1.5 py-1 font-semibold ${
                              s.direction === "bullish" ? "text-emerald-700" : s.direction === "bearish" ? "text-red-700" : "text-zinc-500"
                            }`}>
                              {s.direction ?? "–"}
                            </td>
                            <td className="px-1.5 py-1 text-zinc-600">
                              {driver ? (
                                <span className={`text-[10px] font-medium ${driver.value > 0 ? "text-emerald-600" : driver.value < 0 ? "text-red-600" : "text-zinc-500"}`}>
                                  {driver.label}
                                </span>
                              ) : "–"}
                            </td>
                            <td className={`px-1.5 py-1 text-right tabular-nums ${
                              s.rsi_14 != null && s.rsi_14 > 70 ? "text-red-600 font-semibold" : s.rsi_14 != null && s.rsi_14 < 30 ? "text-emerald-600 font-semibold" : ""
                            }`}>
                              {s.rsi_14 != null ? s.rsi_14.toFixed(0) : "–"}
                            </td>
                            <td className="px-1.5 py-1">
                              {s.pos_52w_range != null ? (
                                <div className="flex items-center gap-1">
                                  <div className="w-10 h-1 bg-zinc-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${s.pos_52w_range > 0.8 ? "bg-emerald-500" : s.pos_52w_range < 0.2 ? "bg-red-500" : "bg-zinc-400"}`}
                                      style={{ width: `${Math.min(s.pos_52w_range * 100, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] text-zinc-400">{(s.pos_52w_range * 100).toFixed(0)}%</span>
                                </div>
                              ) : "–"}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[9px] text-zinc-400 mt-1">
                    Driver = strongest factor behind the signal (Trend, Momentum, Rel Str, Divergence, Volume, Bollinger, Range). RSI &gt; 70 overbought · &lt; 30 oversold.
                  </p>
                </div>
              )}

              {/* Footer: catalysts + link */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-100 bg-zinc-50/30 mt-auto">
                {catalysts.length > 0 ? (
                  <div className="text-[11px] text-zinc-500">
                    <span className="text-[9px] uppercase tracking-wide text-zinc-400 mr-1">Coming up:</span>
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
                  className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
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
            <div className="border border-zinc-200 rounded-2xl p-4 bg-white shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-800 mb-2">This week&apos;s insights</h2>
              <ul className="space-y-1.5">
                {insights.map((ins, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className={
                      ins.tone === "good" ? "text-emerald-600" : ins.tone === "warn" ? "text-amber-600" : "text-zinc-400"
                    }>
                      {ins.tone === "good" ? "▲" : ins.tone === "warn" ? "▼" : "•"}
                    </span>
                    <span className="text-zinc-700">{ins.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {flagged.length > 0 && (
          <div className="border border-zinc-200 rounded-2xl p-4 bg-white shadow-sm flex items-start">
            <p className="text-sm text-zinc-700">
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

      <p className="text-xs text-zinc-400 pb-4">
        Readings are probabilistic, not predictions. Deeper layers:{" "}
        <Link href="/screener" className="underline">stock signals</Link> ·{" "}
        <Link href="/calendar" className="underline">calendar</Link> ·{" "}
        <Link href="/more" className="underline">analytics &amp; settings</Link>
      </p>
    </div>
  );
}
