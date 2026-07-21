import Link from "next/link";
import { getRegimes, getDataHealth } from "../lib/data/queries";
import { getWatchlist } from "../lib/data/watchlist";
import { Sparkline } from "../components/ui";
import { marketVerdict, plainEvidence, TONE_STYLE } from "../lib/plain";

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
        <p className="text-sm text-zinc-400">
          One verdict per index, at the 2–6 week horizon. Click a card for the full evidence.{" "}
          <Link href="/guide" className="underline text-zinc-300">New here? Read the guide.</Link>
        </p>
      </header>

      {stale.length > 0 && (
        <div className="border border-amber-700 bg-amber-950/60 text-amber-200 text-sm px-4 py-3 rounded-lg">
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
              className={`block border ${style.border} rounded-xl bg-zinc-950 hover:bg-zinc-900/60 transition-colors p-5`}
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
                  <p className="text-sm text-zinc-400 mt-1">{v.sub}</p>

                  {why.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {why.map((e, i) => (
                        <li key={i} className="text-sm text-zinc-300">
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
                        <div key={i} className="text-zinc-400">
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

      {flagged.length > 0 && (
        <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-950">
          <p className="text-sm text-zinc-300">
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

      <p className="text-xs text-zinc-600">
        Verdicts are probabilistic, not predictions. Deeper layers:{" "}
        <Link href="/screener" className="underline">stock signals</Link> ·{" "}
        <Link href="/calendar" className="underline">calendar</Link> ·{" "}
        <Link href="/more" className="underline">analytics &amp; settings</Link>
      </p>
    </div>
  );
}
