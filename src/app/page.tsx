import Link from "next/link";
import { getRegimes, getDataHealth } from "../lib/data/queries";
import { getWatchlist } from "../lib/data/watchlist";
import { Sparkline } from "../components/ui";
import { marketVerdict, plainEvidence, buildInsights, TONE_STYLE } from "../lib/plain";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const [regimes, watchlist, health] = await Promise.all([
    getRegimes(), getWatchlist(), getDataHealth(),
  ]);
  const stale = health.freshness.filter((f: { days_behind: number }) => f.days_behind > 4);
  const flagged = watchlist.filter(
    (e) => e.suggestion.verdict === "overbought-risk" || e.suggestion.verdict === "oversold-setup",
  );
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      <header className="space-y-1">
        <p className="text-xs text-zinc-500">{today}</p>
        <h1 className="text-2xl font-bold tracking-tight">What the market says today</h1>
        <p className="text-sm text-zinc-600">
          This app exists to answer one question: <b>is a market correction — or a rebound — likely in the
          coming weeks?</b> It reads leading indicators (participation, momentum divergences, credit, positioning,
          news tone) that tend to turn before price does. One verdict per index; click a card for the full
          evidence. <Link href="/guide" className="underline text-zinc-700">New here? Read the guide.</Link>
        </p>
      </header>

      {stale.length > 0 && (
        <div className="border border-amber-400 bg-amber-100 text-amber-800 text-sm px-4 py-3 rounded-lg">
          ⚠ Some data is stale ({stale.map((s: { item: string }) => s.item).join(", ")}) — read today&apos;s
          verdicts with caution.
        </div>
      )}

      <div className="space-y-4">
        {regimes.map((r) => {
          const g = r.breakdown.gauge;
          const v = marketVerdict(r.regime, g.direction, g.intensity);
          const style = TONE_STYLE[v.tone];
          const why = g.evidence.slice(0, 3);
          const catalysts = r.breakdown.catalysts.slice(0, 3);
          return (
            <Link
              key={r.symbol}
              href={`/market/${r.symbol}`}
              className={`block border ${style.border} rounded-xl bg-white hover:bg-zinc-50 transition-colors p-5`}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-64 flex-1">
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-base font-bold">{r.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${style.chip}`}>
                      {r.regime === "risk_on" ? "market supportive" : r.regime === "risk_off" ? "market hostile" : "market mixed"}
                    </span>
                  </div>
                  <p className={`text-xl font-semibold ${style.text}`}>{v.headline}</p>
                  <p className="text-sm text-zinc-600 mt-1">{v.sub}</p>

                  {why.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {why.map((e, i) => (
                        <li key={i} className="text-sm text-zinc-700">
                          · {plainEvidence(e.item, e.detail)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="text-right space-y-2 shrink-0">
                  <div className="text-zinc-500">
                    <Sparkline values={r.history.map((h) => h.composite)} baseline={50} width={140} height={34} />
                  </div>
                  {catalysts.length > 0 && (
                    <div className="text-xs text-zinc-500">
                      <span className="uppercase text-[10px] tracking-wide">coming up</span>
                      {catalysts.map((c, i) => (
                        <div key={i} className="text-zinc-600">
                          {c.event_name.replace("Earnings: ", "")} · {c.release_at.slice(5, 10).replace("-", "/")}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-zinc-500">full detail →</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {(() => {
        const insights = buildInsights(regimes);
        if (insights.length === 0) return null;
        return (
          <div className="border border-zinc-300 rounded-xl p-5 bg-white">
            <h2 className="text-sm font-semibold text-zinc-800 mb-2">This week&apos;s insights</h2>
            <ul className="space-y-1.5">
              {insights.map((ins, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className={
                    ins.tone === "good" ? "text-green-600" : ins.tone === "warn" ? "text-amber-600" : "text-zinc-400"
                  }>
                    {ins.tone === "good" ? "▲" : ins.tone === "warn" ? "▼" : "•"}
                  </span>
                  <span className="text-zinc-700">{ins.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-zinc-400 mt-2">
              Generated from this week&apos;s data — each observation traces to a number on the index detail pages.
            </p>
          </div>
        );
      })()}

      {flagged.length > 0 && (
        <div className="border border-zinc-300 rounded-xl p-4 bg-white">
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

      <p className="text-xs text-zinc-400">
        Verdicts are probabilistic, not predictions. Deeper layers:{" "}
        <Link href="/screener" className="underline">stock signals</Link> ·{" "}
        <Link href="/calendar" className="underline">calendar</Link> ·{" "}
        <Link href="/more" className="underline">analytics &amp; settings</Link>
      </p>
    </div>
  );
}
