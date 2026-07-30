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

/* ── Indicator explanation tips ──────────────────────────────────────── */

const INDICATOR_TIPS: Record<string, string> = {
  rsi: "Momentum speed gauge. Above 70 = overbought (pullback risk), below 30 = oversold (bounce setup).",
  bollinger: "Price position within volatility bands. %B > 1 = above upper band, < 0 = below lower band.",
  macd: "Trend-following momentum. Positive = bullish momentum, negative = bearish. Expanding = strengthening.",
  volume: "This week's volume vs 20-week average. Surges (>1.5x) confirm breakouts; light volume = low conviction.",
  range: "Where price sits in its 52-week high-low range. Near top = strength/breakout, near bottom = weakness.",
  adx: "Trend strength regardless of direction. Above 25 = trending market, below 20 = choppy, sideways.",
  ma: "Price position vs institutional moving averages (30w ≈ 150-day, 40w ≈ 200-day). Above = bullish structure.",
  divergence: "When price makes new highs/lows but RSI doesn't confirm — early warning of a potential reversal.",
};

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
  const tip = INDICATOR_TIPS[ind.id];
  return (
    <div className={`rounded-lg border border-zinc-200/80 ${c.left} border-l-[3px] px-3 py-2.5 ${c.bg}`}>
      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{ind.name}</div>
      <div className="text-lg font-bold text-zinc-900 leading-tight mt-0.5">{ind.value}</div>
      <div className={`text-xs font-medium ${c.text} mt-0.5`}>{ind.reading}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="flex-1 h-1.5 bg-zinc-200/60 rounded-full overflow-hidden">
          <div className={`h-full ${c.bar} rounded-full`} style={{ width: `${ind.confidence}%` }} />
        </div>
        <span className="text-[10px] font-medium text-zinc-400 w-8 text-right">{ind.confidence}%</span>
      </div>
      {tip && <p className="text-[10px] text-zinc-400 mt-1.5 leading-snug">{tip}</p>}
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
        <span className={`text-xl font-bold ${color}`}>{score}</span>
        <span className={`text-xs font-semibold ${color}`}>{label}</span>
      </div>
      <div
        className="h-2 rounded-full mt-1 relative"
        style={{ background: "linear-gradient(to right, #dc2626, #f59e0b, #22c55e)" }}
      >
        <div
          className="absolute w-3 h-3 rounded-full bg-white border-2 border-zinc-800 -top-0.5 shadow-sm"
          style={{ left: `calc(${score}% - 6px)` }}
        />
      </div>
      <p className="text-[10px] text-zinc-400 mt-1">
        0 = Extreme Fear, 100 = Extreme Greed. Combines trend, breadth, intermarket, positioning &amp; sentiment.
      </p>
    </div>
  );
}

function PulseMetric({
  label, value, sub, color, tip,
}: {
  label: string; value: string; sub?: string; color?: string; tip: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-bold ${color ?? "text-zinc-900"} leading-tight`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
      <p className="text-[10px] text-zinc-400 mt-1 leading-snug">{tip}</p>
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
    <div className="max-w-5xl mx-auto space-y-6 py-4 px-2">
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

      {/* Index cards */}
      <div className="space-y-8">
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

          // Extract VIX + breadth from the regime breakdown
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
              className={`border ${style.border} rounded-2xl bg-white shadow-sm overflow-hidden`}
            >
              {/* Card header */}
              <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h2 className="text-lg font-bold tracking-tight">{r.name}</h2>
                    {daily?.close != null ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-bold text-zinc-800 tabular-nums">
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
                      <span className="text-base font-bold text-zinc-800 tabular-nums">
                        {tech.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    ) : null}
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${style.chip}`}>
                      {r.regime === "risk_on" ? "supportive" : r.regime === "risk_off" ? "hostile" : "mixed"}
                    </span>
                  </div>
                  <p className={`text-base font-semibold ${style.text}`}>{v.headline}</p>
                  <p className="text-sm text-zinc-500 mt-0.5">{v.sub}</p>
                </div>
                <div className="text-right shrink-0">
                  <Sparkline values={r.history.map((h) => h.composite)} baseline={50} width={130} height={32} />
                  <div className="text-[10px] text-zinc-400 mt-0.5">12-month regime history</div>
                </div>
              </div>

              {/* Market Pulse */}
              <div className="mx-5 mb-4 border border-zinc-200 rounded-xl bg-zinc-50/50 p-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Market Pulse</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {/* Fear & Greed */}
                  <div className="col-span-2 sm:col-span-1">
                    <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                      Fear &amp; Greed
                    </div>
                    <FearGreedMeter score={r.composite_score} />
                  </div>

                  {/* VIX */}
                  <PulseMetric
                    label="Volatility (VIX)"
                    value={vix != null ? vix.toFixed(1) : "–"}
                    sub={vixLabel ? `${vixPctile?.toFixed(0)}th pctile — ${vixLabel}` : undefined}
                    color={vixPctile != null && vixPctile > 80 ? "text-red-700" : vixPctile != null && vixPctile < 20 ? "text-emerald-700" : "text-zinc-900"}
                    tip="CBOE Volatility Index. High VIX = fear/expected swings. Low VIX = calm/complacency."
                  />

                  {/* % Overbought */}
                  <PulseMetric
                    label="Overbought"
                    value={cb ? `${cb.pct_overbought.toFixed(0)}%` : "–"}
                    sub={cb ? `of ${cb.total} members` : undefined}
                    color={cb && cb.pct_overbought > 30 ? "text-amber-700" : "text-zinc-900"}
                    tip="% of stocks with weekly RSI above 70. High readings warn the rally may be crowded."
                  />

                  {/* % Oversold */}
                  <PulseMetric
                    label="Oversold"
                    value={cb ? `${cb.pct_oversold.toFixed(0)}%` : "–"}
                    sub={cb ? `of ${cb.total} members` : undefined}
                    color={cb && cb.pct_oversold > 30 ? "text-red-700" : "text-zinc-900"}
                    tip="% of stocks with weekly RSI below 30. High readings may signal a washout near a bottom."
                  />

                  {/* % Above 200d */}
                  <PulseMetric
                    label="Above 200-day MA"
                    value={pctAbove200d != null ? `${pctAbove200d.toFixed(0)}%` : "–"}
                    sub="of members"
                    color={pctAbove200d != null && pctAbove200d > 60 ? "text-emerald-700" : pctAbove200d != null && pctAbove200d < 40 ? "text-red-700" : "text-zinc-900"}
                    tip="Broad participation gauge. Above 60% = healthy market breadth. Below 40% = narrow, fragile rally."
                  />
                </div>
              </div>

              {/* Technical Indicators grid */}
              {indicators.length > 0 && (
                <div className="mx-5 mb-4">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                    Technical Indicators
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {indicators.map((ind) => (
                      <IndicatorTile key={ind.id} ind={ind} />
                    ))}
                  </div>
                </div>
              )}

              {/* Top constituents by market cap */}
              {topStocks.length > 0 && (
                <div className="mx-5 mb-4">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                    Top 20 by Market Cap
                  </h3>
                  <div className="overflow-x-auto border border-zinc-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="text-zinc-500 text-left bg-zinc-50/80">
                        <tr>
                          <th className="pl-3 pr-2 py-2 w-6">#</th>
                          <th className="px-2 py-2">Ticker</th>
                          <th className="px-2 py-2">Company</th>
                          <th className="px-2 py-2 text-right">Mkt Cap</th>
                          <th className="px-2 py-2 text-right">Price</th>
                          <th className="px-2 py-2 text-right">Chg %</th>
                          <th className="px-2 py-2">Signal</th>
                          <th className="px-2 py-2 text-right">Conv</th>
                          <th className="px-2 py-2 text-right">RSI</th>
                          <th className="px-2 py-2">52w Range</th>
                          <th className="px-2 py-2 text-right">RS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topStocks.map((s, i) => (
                          <tr key={s.symbol} className="border-t border-zinc-100 hover:bg-zinc-50/60 transition-colors">
                            <td className="pl-3 pr-2 py-1.5 text-zinc-400">{i + 1}</td>
                            <td className="px-2 py-1.5 font-semibold">
                              <Link href={`/stock/${encodeURIComponent(s.symbol)}`} className="hover:underline">
                                {s.symbol}
                              </Link>
                            </td>
                            <td className="px-2 py-1.5 text-zinc-600 max-w-[160px] truncate">{s.name ?? "–"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">
                              {fmtCap(s.market_cap)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                              {s.close != null ? s.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–"}
                            </td>
                            <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${
                              s.change_pct != null && s.change_pct > 0 ? "text-emerald-600" : s.change_pct != null && s.change_pct < 0 ? "text-red-600" : "text-zinc-500"
                            }`}>
                              {s.change_pct != null ? `${s.change_pct >= 0 ? "+" : ""}${(s.change_pct * 100).toFixed(2)}%` : "–"}
                            </td>
                            <td className={`px-2 py-1.5 font-semibold ${
                              s.direction === "bullish" ? "text-emerald-700" : s.direction === "bearish" ? "text-red-700" : "text-zinc-500"
                            }`}>
                              {s.direction ?? "–"}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{s.conviction != null ? Math.round(s.conviction) : "–"}</td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${
                              s.rsi_14 != null && s.rsi_14 > 70 ? "text-red-600 font-semibold" : s.rsi_14 != null && s.rsi_14 < 30 ? "text-emerald-600 font-semibold" : ""
                            }`}>
                              {s.rsi_14 != null ? s.rsi_14.toFixed(0) : "–"}
                            </td>
                            <td className="px-2 py-1.5">
                              {s.pos_52w_range != null ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${s.pos_52w_range > 0.8 ? "bg-emerald-500" : s.pos_52w_range < 0.2 ? "bg-red-500" : "bg-zinc-400"}`}
                                      style={{ width: `${Math.min(s.pos_52w_range * 100, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-zinc-400 w-7 text-right">{(s.pos_52w_range * 100).toFixed(0)}%</span>
                                </div>
                              ) : "–"}
                            </td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${
                              s.mansfield_rs != null && s.mansfield_rs > 0 ? "text-emerald-600" : s.mansfield_rs != null && s.mansfield_rs < 0 ? "text-red-600" : ""
                            }`}>
                              {s.mansfield_rs != null ? s.mansfield_rs.toFixed(1) : "–"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1.5">
                    RSI &gt; 70 = overbought (red), &lt; 30 = oversold (green). RS = Mansfield relative strength vs index (positive = outperforming). 52w range bar = position in yearly high-low.
                  </p>
                </div>
              )}

              {/* Footer: catalysts + link */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100 bg-zinc-50/30">
                {catalysts.length > 0 ? (
                  <div className="text-xs text-zinc-500">
                    <span className="text-[10px] uppercase tracking-wide text-zinc-400 mr-1">Coming up:</span>
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
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
                >
                  full detail →
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Weekly insights */}
      {(() => {
        const insights = buildInsights(regimes);
        if (insights.length === 0) return null;
        return (
          <div className="border border-zinc-200 rounded-2xl p-5 bg-white shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-800 mb-3">This week&apos;s insights</h2>
            <ul className="space-y-2">
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
            <p className="text-[11px] text-zinc-400 mt-3">
              Each observation traces to a number on the index detail pages.
            </p>
          </div>
        );
      })()}

      {/* Watchlist alert */}
      {flagged.length > 0 && (
        <div className="border border-zinc-200 rounded-2xl p-4 bg-white shadow-sm">
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

      <p className="text-xs text-zinc-400 pb-4">
        Readings are probabilistic, not predictions. Deeper layers:{" "}
        <Link href="/screener" className="underline">stock signals</Link> ·{" "}
        <Link href="/calendar" className="underline">calendar</Link> ·{" "}
        <Link href="/more" className="underline">analytics &amp; settings</Link>
      </p>
    </div>
  );
}
