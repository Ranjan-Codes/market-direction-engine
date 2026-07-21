import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getRegimes, getBreadthLatest, getIntermarket, getMacroSnapshot,
} from "../../../lib/data/queries";
import { GaugeDial, RegimeBadge, Sparkline, Panel, Tag, fmtNum, fmtPct } from "../../../components/ui";
import { marketVerdict, plainEvidence, TONE_STYLE } from "../../../lib/plain";

export const dynamic = "force-dynamic";

export default async function MarketDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const [regimes, breadthAll, intermarket, macroAll] = await Promise.all([
    getRegimes(), getBreadthLatest(), getIntermarket(), getMacroSnapshot(),
  ]);
  const r = regimes.find((x) => x.symbol === symbol.toUpperCase());
  if (!r) notFound();
  const g = r.breakdown.gauge;
  const v = marketVerdict(r.regime, g.direction, g.intensity);
  const style = TONE_STYLE[v.tone];
  const breadth = breadthAll.find((b: { symbol: string }) => b.symbol === r.symbol);
  const country = (r.breakdown.inputs?.trend as Record<string, unknown>)?.country ?? (r.symbol === "UKX" ? "UK" : "US");
  const macro = macroAll.filter((m: { country: string }) => m.country === country);

  return (
    <div className="max-w-5xl mx-auto space-y-5 py-2">
      <div className="text-xs text-zinc-500">
        <Link href="/" className="underline">← Today</Link>
      </div>

      <div className={`border ${style.border} rounded-xl bg-white p-5`}>
        <div className="flex items-center gap-4 flex-wrap">
          <GaugeDial direction={g.direction} intensity={g.intensity} />
          <div className="flex-1 min-w-64">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{r.name}</h1>
              <RegimeBadge regime={r.regime} />
              <span className="text-xs text-zinc-500">week ending {r.as_of_date}</span>
            </div>
            <p className={`text-lg font-semibold mt-1 ${style.text}`}>{v.headline}</p>
            <p className="text-sm text-zinc-600">{v.sub}</p>
          </div>
          <Sparkline values={r.history.map((h) => h.composite)} baseline={50} width={180} height={44} />
        </div>
        {g.evidence.length > 0 && (
          <div className="mt-4 border-t border-zinc-200 pt-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1.5">All warning evidence</p>
            <ul className="space-y-1">
              {g.evidence.map((e, i) => (
                <li key={i} className="text-sm text-zinc-700">
                  · {plainEvidence(e.item, e.detail)}{" "}
                  <span className="text-zinc-400 text-xs">({e.detail}, weight {e.weight})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Panel
        title="Scores behind the verdict (0–100, 50 = neutral)"
        help="Five evidence families blend into the composite: ≥60 supportive (risk-on), ≤40 hostile (risk-off). Breadth, intermarket, positioning and narrative tend to move BEFORE price (leading); trend confirms. n/a = not enough data yet — weights renormalise."
      >
        <table className="w-full text-sm">
          <thead className="text-zinc-500 text-left text-xs">
            <tr>
              <th className="py-1">Trend <Tag kind="coincident" /></th>
              <th>Breadth <Tag kind="leading" /></th>
              <th>Intermarket <Tag kind="leading" /></th>
              <th>Positioning <Tag kind="leading" /></th>
              <th>Narrative <Tag kind="leading" /></th>
              <th>Composite</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {[r.trend_score, r.breadth_score, r.intermarket_score, r.positioning_score, r.narrative_score].map((s, i) => (
                <td key={i} className={`py-2 text-base ${s == null ? "text-zinc-400" : s >= 60 ? "text-green-700" : s <= 40 ? "text-red-700" : "text-zinc-800"}`}>
                  {s ?? "n/a"}
                </td>
              ))}
              <td className="py-2 text-base font-bold">{r.composite_score}</td>
            </tr>
          </tbody>
        </table>
      </Panel>

      {breadth && (
        <Panel
          title="Participation (breadth)"
          tag="leading"
          asOf={breadth.as_of}
          help="How many member stocks are actually joining the move. Healthy: most stocks above their averages, more new highs than lows, McClellan positive. The danger sign is divergence: index near highs while these numbers fall."
        >
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            {(
              [
                ["Advancers / decliners", `${breadth.advancers} / ${breadth.decliners}`],
                ["Above 50-day avg", `${fmtNum(breadth.pct_above_50d, 0)}%`],
                ["Above 200-day avg", `${fmtNum(breadth.pct_above_200d, 0)}%`],
                ["New 52w highs / lows", `${breadth.new_highs_52w} / ${breadth.new_lows_52w}`],
                ["McClellan", fmtNum(breadth.mcclellan_osc, 0)],
                ["Divergence", breadth.breadth_divergence ? "YES ⚠" : "no"],
              ] as Array<[string, string]>
            ).map(([k, val]) => (
              <div key={k}>
                <p className="text-[11px] text-zinc-500">{k}</p>
                <p className={`font-semibold ${val.includes("⚠") ? "text-red-700" : "text-zinc-800"}`}>{val}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="Cross-asset backdrop (13-week moves)"
          tag="leading"
          help="Reads from other markets that often move before equities: rising VIX = growing fear; strong dollar = headwind; copper up vs gold = growth optimism; money rotating into defensive sectors = quiet risk-off."
        >
          <table className="w-full text-xs">
            <tbody>
              {intermarket.map((m: Record<string, any>) => {
                const chg = m.close_13w_ago != null ? m.close / m.close_13w_ago - 1 : null;
                return (
                  <tr key={m.symbol} className="border-t border-zinc-200">
                    <td className="py-1 font-semibold">{m.symbol}</td>
                    <td className="text-zinc-500">{m.role}</td>
                    <td className={chg != null && chg > 0 ? "text-green-700" : "text-red-700"}>{fmtPct(chg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel
          title={`Macro (${country})`}
          help="Latest official numbers. The leading ones (yield-curve spreads, credit spreads, jobless claims) matter most for the weeks ahead; monthly series lag by design."
        >
          <table className="w-full text-xs">
            <tbody>
              {macro.map((m: Record<string, any>) => (
                <tr key={m.series_code} className="border-t border-zinc-200">
                  <td className="py-1">{m.name}</td>
                  <td><Tag kind={m.lead_lag ?? "coincident"} /></td>
                  <td className="font-semibold">{fmtNum(m.value, 2)}</td>
                  <td className="text-zinc-400">{String(m.obs_date).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel
        title="Scheduled catalysts (next 30 days)"
        help="The releases and heavyweight earnings that could trigger the move. * = high importance."
      >
        <div className="text-sm text-zinc-700 leading-relaxed">
          {r.breakdown.catalysts.length === 0
            ? "None on the calendar yet."
            : r.breakdown.catalysts.map((c, i) => (
                <span key={i} className={c.importance === "high" ? "text-amber-700" : ""}>
                  {c.event_name.replace("Earnings: ", "")} {c.release_at.slice(5, 10).replace("-", "/")}
                  {c.importance === "high" ? "*" : ""}
                  {i < r.breakdown.catalysts.length - 1 ? "  ·  " : ""}
                </span>
              ))}
        </div>
      </Panel>
    </div>
  );
}
