import { getRegimes } from "../../lib/data/queries";
import { getWatchlist } from "../../lib/data/watchlist";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * Print-optimized regime + watchlist snapshot: use the button (or Ctrl+P)
 * and "Save as PDF". Light background for paper.
 */
export default async function ReportPage() {
  const [regimes, watchlist] = await Promise.all([getRegimes(), getWatchlist()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-white text-zinc-900 rounded p-6 print:p-0 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Market Direction Snapshot — {today}</h1>
          <p className="text-xs text-zinc-500">
            2–6 week horizon · weights v1 · analytical decision support only, not investment advice
          </p>
        </div>
        <PrintButton />
      </div>

      <section>
        <h2 className="font-semibold border-b border-zinc-300 pb-1 mb-2">Regime & reversal gauges</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500 text-xs">
            <tr><th className="py-1">Index</th><th>Regime</th><th>Composite</th><th>Gauge</th><th>Evidence</th></tr>
          </thead>
          <tbody>
            {regimes.map((r) => {
              const g = r.breakdown.gauge;
              return (
                <tr key={r.symbol} className="border-t border-zinc-200 align-top">
                  <td className="py-1.5 font-semibold">{r.symbol}</td>
                  <td>{r.regime.replace("_", "-")} </td>
                  <td>{r.composite_score}</td>
                  <td className={g.direction === "overbought-reversal-risk" ? "text-red-700 font-semibold" : g.direction === "oversold-rebound-setup" ? "text-green-700 font-semibold" : ""}>
                    {g.direction === "none" ? "—" : `${g.direction} (${g.intensity})`}
                  </td>
                  <td className="text-xs text-zinc-600">
                    {g.evidence.map((e) => e.detail).join("; ") || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-semibold border-b border-zinc-300 pb-1 mb-2">Upcoming catalysts (30 days)</h2>
        <table className="w-full text-xs">
          <tbody>
            {regimes.map((r) => (
              <tr key={r.symbol} className="border-t border-zinc-200 align-top">
                <td className="py-1 font-semibold w-14">{r.symbol}</td>
                <td className="text-zinc-700">
                  {r.breakdown.catalysts
                    .map((c) => `${c.event_name.replace("Earnings: ", "")} ${c.release_at.slice(5, 10)}${c.importance === "high" ? "*" : ""}`)
                    .join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-zinc-400 mt-1">* high importance</p>
      </section>

      <section>
        <h2 className="font-semibold border-b border-zinc-300 pb-1 mb-2">
          Watchlist ({watchlist.length})
        </h2>
        {watchlist.length === 0 ? (
          <p className="text-xs text-zinc-500">Empty.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500 text-xs">
              <tr><th className="py-1">Symbol</th><th>Verdict</th><th>Signal</th><th>Evidence</th></tr>
            </thead>
            <tbody>
              {watchlist.map((e) => (
                <tr key={e.symbol} className="border-t border-zinc-200 align-top">
                  <td className="py-1.5 font-semibold">{e.symbol}</td>
                  <td className={`text-xs ${e.suggestion.verdict === "overbought-risk" ? "text-red-700 font-semibold" : e.suggestion.verdict === "oversold-setup" ? "text-green-700 font-semibold" : ""}`}>
                    {e.suggestion.headline}
                  </td>
                  <td className="text-xs">
                    {e.direction} {e.conviction != null ? `(${Math.round(e.conviction)})` : ""}{e.gated ? " · gated" : ""}
                  </td>
                  <td className="text-xs text-zinc-600">{e.suggestion.evidence.join("; ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-[10px] text-zinc-400 border-t border-zinc-200 pt-2">
        Generated {new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · sources: Yahoo, FRED,
        ForexFactory, CFTC, RSS/GDELT/StockTwits · all outputs probabilistic.
      </p>
    </div>
  );
}
