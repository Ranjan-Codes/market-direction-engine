import Link from "next/link";
import { getWatchlist } from "../../lib/data/watchlist";
import { WatchStar } from "../../components/watch-star";
import { Panel, fmtNum } from "../../components/ui";

export const dynamic = "force-dynamic";

const VERDICT_STYLE: Record<string, string> = {
  "overbought-risk": "border-red-800 text-red-300",
  "oversold-setup": "border-green-800 text-green-300",
  constructive: "border-emerald-900 text-emerald-300",
  weak: "border-orange-900 text-orange-300",
  mixed: "border-zinc-700 text-zinc-300",
};

export default async function WatchlistPage() {
  const entries = await getWatchlist();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">
        Watchlist{" "}
        <span className="text-xs font-normal text-zinc-500">
          {entries.length} names · leading-indicator verdicts at the 2–6 week horizon · add names with the ☆
          in the <Link href="/screener" className="underline">screener</Link> or on any stock page
        </span>
      </h1>

      {entries.length === 0 && (
        <p className="text-sm text-zinc-400 border border-zinc-800 rounded p-6 text-center">
          Empty. Star names in the <Link href="/screener" className="underline">screener</Link> to track how
          the leading indicators read them.
        </p>
      )}

      {entries.map((e) => (
        <Panel
          key={e.symbol}
          title={`${e.symbol} — ${e.name ?? ""}`}
          asOf={e.week_end}
        >
          <div className="flex flex-wrap gap-x-6 gap-y-2 items-start">
            <div className="w-56 shrink-0">
              <div className={`border rounded px-2 py-1.5 text-xs font-semibold ${VERDICT_STYLE[e.suggestion.verdict]}`}>
                {e.suggestion.headline}
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                <WatchStar symbol={e.symbol} inList={true} />
                <span>{e.index_symbol}</span>
                <span>{e.sector}</span>
              </div>
            </div>
            <div className="flex-1 min-w-64">
              {e.suggestion.evidence.length > 0 ? (
                <ul className="text-xs text-zinc-300 space-y-0.5">
                  {e.suggestion.evidence.map((ev, i) => <li key={i}>• {ev}</li>)}
                </ul>
              ) : (
                <p className="text-xs text-zinc-500">No notable leading-indicator evidence this week.</p>
              )}
            </div>
            <table className="text-xs shrink-0">
              <tbody>
                <tr>
                  <td className="text-zinc-500 pr-3">Signal</td>
                  <td className={e.direction === "bullish" ? "text-green-400" : e.direction === "bearish" ? "text-red-400" : ""}>
                    {e.direction ?? "–"} {e.conviction != null ? `(${Math.round(e.conviction)})` : ""}
                    {e.gated ? " · gated" : ""}{e.event_blackout ? " · blackout" : ""}
                  </td>
                </tr>
                <tr><td className="text-zinc-500 pr-3">Weekly RSI</td><td>{fmtNum(e.rsi_14)}</td></tr>
                <tr><td className="text-zinc-500 pr-3">Mansfield RS</td><td>{fmtNum(e.mansfield_rs)}</td></tr>
                <tr><td className="text-zinc-500 pr-3">52w range</td><td>{e.pos_52w_range != null ? `${(e.pos_52w_range * 100).toFixed(0)}%` : "–"}</td></tr>
                <tr>
                  <td className="text-zinc-500 pr-3">Detail</td>
                  <td><Link href={`/stock/${encodeURIComponent(e.symbol)}`} className="underline">chart →</Link></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
    </div>
  );
}
