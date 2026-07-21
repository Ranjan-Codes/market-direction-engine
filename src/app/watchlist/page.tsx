import Link from "next/link";
import { getWatchlist } from "../../lib/data/watchlist";
import { WatchStar } from "../../components/watch-star";
import { Panel, HelpNote, fmtNum } from "../../components/ui";

export const dynamic = "force-dynamic";

const VERDICT_STYLE: Record<string, string> = {
  "overbought-risk": "border-red-300 text-red-800",
  "oversold-setup": "border-green-300 text-green-800",
  constructive: "border-emerald-300 text-emerald-700",
  weak: "border-orange-300 text-orange-700",
  mixed: "border-zinc-400 text-zinc-700",
};

export default async function WatchlistPage() {
  const entries = await getWatchlist();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">
        Watchlist{" "}
        <span className="text-xs font-normal text-zinc-500">
          {entries.length} names · leading-indicator verdicts at the 2–6 week horizon · add names with the ☆
          in the <Link href="/screener" className="underline">screener</Link> or on any stock page ·{" "}
          <a href="/api/export/watchlist" className="underline">export CSV</a> ·{" "}
          <Link href="/report" className="underline">print report</Link>
        </span>
      </h1>

      <div className="border border-zinc-300 rounded bg-white">
        <HelpNote>
          Each watched name gets a plain-English verdict from its <b>leading</b> indicators — the same logic
          as the index gauge, applied per stock. <b>Overbought — profit-booking risk</b> (red): stretch
          evidence dominates (weekly RSI &gt; 70, price pinned to the upper Bollinger band near 52-week
          highs, bearish divergence, or its index gauge firing) — even a genuinely strong stock earns this
          when extended; it means &quot;late to add, consider trimming into strength&quot;, not
          &quot;short it&quot;. <b>Oversold — rebound setup</b> (green): the mirror image.{" "}
          <b>Constructive</b>: uptrend intact, no reversal evidence — the boring good one.{" "}
          <b>Weak</b>: downtrend + poor relative strength — avoid or trim. <b>Mixed</b>: no edge. The
          evidence bullets show exactly why, including earnings dates (expect volatility) and regime gates.
        </HelpNote>
      </div>

      {entries.length === 0 && (
        <p className="text-sm text-zinc-600 border border-zinc-300 rounded p-6 text-center">
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
              <div className="flex items-center gap-2 mt-2 text-xs text-zinc-600">
                <WatchStar symbol={e.symbol} inList={true} />
                <span>{e.index_symbol}</span>
                <span>{e.sector}</span>
              </div>
            </div>
            <div className="flex-1 min-w-64">
              {e.suggestion.evidence.length > 0 ? (
                <ul className="text-xs text-zinc-700 space-y-0.5">
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
                  <td className={e.direction === "bullish" ? "text-green-700" : e.direction === "bearish" ? "text-red-700" : ""}>
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
