import Link from "next/link";

import {
  getReversalScreen,
  type ReversalScreenRow,
} from "../../lib/data/reversal-screen";
import { DEFAULT_REVERSAL_BUY_THRESHOLDS } from "../../lib/compute/reversal-buy";
import { HelpNote, Panel, fmtNum } from "../../components/ui";

export const dynamic = "force-dynamic";

const T = DEFAULT_REVERSAL_BUY_THRESHOLDS;

function Chip({ ok, label }: { ok: boolean; label: string }) {
  const cls = ok
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}
      title={ok ? `${label}: confirmed` : `${label}: not confirmed`}
    >
      {ok ? "\u2713" : "\u2013"} {label}
    </span>
  );
}

function sortRows(rows: ReversalScreenRow[]): ReversalScreenRow[] {
  return [...rows].sort((a, b) => {
    if (a.result.triggered !== b.result.triggered) {
      return a.result.triggered ? -1 : 1;
    }
    if (a.result.confirmedCount !== b.result.confirmedCount) {
      return b.result.confirmedCount - a.result.confirmedCount;
    }
    return a.symbol.localeCompare(b.symbol);
  });
}

export default async function ReversalScreenPage() {
  const rows = sortRows(await getReversalScreen());
  const buys = rows.filter((r) => r.result.triggered);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reversal Buy screen</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Index constituents where a short-term reversal Buy may be setting up.
        </p>
      </div>

      <HelpNote>
        This is a PRIMARY technical trigger, not advice. A Buy fires only when
        all four conditions confirm together: net-buyer volume
        (volume_vs_20w &ge; {fmtNum(T.volumeFloor, 1)} and confirmed), RSI rising
        and inside {T.rsiLower}&ndash;{T.rsiUpper}, a green weekly candle, and
        price tagging the lower Bollinger band (%B &le; {fmtNum(T.bbPctBMax, 2)}).
        Social, blog and fundamental corroboration are separate, later steps in
        the confirmation chain &mdash; see each stock&rsquo;s detail page.
      </HelpNote>

      <Panel
        title={`Candidates (${buys.length} firing / ${rows.length} scanned)`}
        help="Only index-member equities are scanned. Rows with all four chips lit are firing a Buy."
      >
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No data yet. Once weekly technicals have been computed for index
            constituents, candidates will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th className="py-1 pr-3">Symbol</th>
                  <th className="py-1 pr-3">Index</th>
                  <th className="py-1 pr-3">Signal</th>
                  <th className="py-1 pr-3">Conditions</th>
                  <th className="py-1 pr-3 text-right">RSI</th>
                  <th className="py-1 pr-3 text-right">%B</th>
                  <th className="py-1 pr-3 text-right">Vol vs 20w</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.symbol}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-1.5 pr-3 font-medium">
                      <Link
                        href={`/stock/${encodeURIComponent(r.symbol)}`}
                        className="text-sky-600 hover:underline dark:text-sky-400"
                      >
                        {r.symbol}
                      </Link>
                      {r.name ? (
                        <span className="ml-2 text-xs text-slate-400">
                          {r.name}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-500">
                      {r.index_symbol}
                    </td>
                    <td className="py-1.5 pr-3">
                      {r.result.triggered ? (
                        <span className="rounded bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white">
                          BUY
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {r.result.confirmedCount}/4
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        <Chip ok={r.result.conditions.netBuyerVolume} label="Vol" />
                        <Chip
                          ok={r.result.conditions.rsiRisingInBand}
                          label="RSI"
                        />
                        <Chip
                          ok={r.result.conditions.greenWeeklyCandle}
                          label="Green"
                        />
                        <Chip
                          ok={r.result.conditions.lowerBollingerTag}
                          label="LowerBB"
                        />
                      </div>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {fmtNum(r.rsi14, 0)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {fmtNum(r.bbPctB, 2)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {fmtNum(r.volumeVs20w, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
