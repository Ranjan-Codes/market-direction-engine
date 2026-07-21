import Link from "next/link";
import {
  getRegimes, getBreadthLatest, getIntermarket, getMacroSnapshot, getDataHealth,
} from "../lib/data/queries";
import {
  GaugeDial, RegimeBadge, Sparkline, Panel, Tag, fmtNum, fmtPct,
} from "../components/ui";

export const dynamic = "force-dynamic";

export default async function RegimeDashboard() {
  const [regimes, breadth, intermarket, macro, health] = await Promise.all([
    getRegimes(), getBreadthLatest(), getIntermarket(), getMacroSnapshot(), getDataHealth(),
  ]);
  const stale = health.freshness.filter((f: { days_behind: number }) => f.days_behind > 4);

  return (
    <div className="space-y-4">
      {stale.length > 0 && (
        <div className="border border-amber-700 bg-amber-950 text-amber-200 text-xs px-3 py-2 rounded">
          ⚠ Stale data: {stale.map((s: { item: string; latest: string }) => `${s.item} (last ${s.latest})`).join("; ")}
        </div>
      )}

      {/* North-star: reversal-risk gauges first */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {regimes.map((r) => {
          const g = r.breakdown.gauge;
          const firing = g.direction !== "none";
          return (
            <section
              key={r.symbol}
              className={`border rounded bg-zinc-950 ${
                g.direction === "overbought-reversal-risk"
                  ? "border-red-800"
                  : g.direction === "oversold-rebound-setup"
                    ? "border-green-800"
                    : "border-zinc-800"
              }`}
            >
              <header className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
                <div>
                  <span className="font-bold">{r.symbol}</span>{" "}
                  <span className="text-xs text-zinc-400">{r.name}</span>
                </div>
                <RegimeBadge regime={r.regime} />
              </header>
              <div className="flex items-center gap-3 p-3">
                <GaugeDial direction={g.direction} intensity={g.intensity} />
                <div className="text-xs space-y-1 flex-1">
                  <div className={firing ? "font-semibold" : "text-zinc-400"}>
                    {g.direction === "overbought-reversal-risk" && "⚠ Overbought — reversal risk"}
                    {g.direction === "oversold-rebound-setup" && "◆ Oversold — rebound setup"}
                    {g.direction === "none" && "No reversal warning"}
                  </div>
                  <div className="text-zinc-400">
                    composite {r.composite_score} · conf {fmtNum(r.confidence, 2)} · wk {r.as_of_date}
                  </div>
                  <div className="text-zinc-300">
                    <Sparkline
                      values={r.history.map((h) => h.composite)}
                      baseline={50}
                      width={150}
                    />
                  </div>
                </div>
              </div>
              {g.evidence.length > 0 && (
                <ul className="px-3 pb-2 text-[11px] text-zinc-300 space-y-0.5">
                  {g.evidence.map((e, i) => (
                    <li key={i}>• {e.detail} <span className="text-zinc-500">(w{e.weight})</span></li>
                  ))}
                </ul>
              )}
              {r.breakdown.catalysts.length > 0 && (
                <div className="px-3 pb-3 text-[11px] text-zinc-400 border-t border-zinc-900 pt-2">
                  <span className="uppercase text-[10px] text-zinc-500">Catalysts 30d:</span>{" "}
                  {r.breakdown.catalysts.slice(0, 6).map((c, i) => (
                    <span key={i} className={c.importance === "high" ? "text-amber-300" : ""}>
                      {c.event_name.replace("Earnings: ", "")} {c.release_at.slice(5, 10)}
                      {i < Math.min(r.breakdown.catalysts.length, 6) - 1 ? " · " : ""}
                    </span>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Sub-scores */}
      <Panel title="Regime sub-scores (0–100, 50 = neutral)" asOf={regimes[0]?.as_of_date}>
        <table className="w-full text-xs">
          <thead className="text-zinc-500 text-left">
            <tr>
              <th className="py-1">Index</th>
              <th>Trend <Tag kind="coincident" /></th>
              <th>Breadth <Tag kind="leading" /></th>
              <th>Intermarket <Tag kind="leading" /></th>
              <th>Positioning <Tag kind="leading" /></th>
              <th>Narrative <Tag kind="leading" /></th>
              <th>Composite</th>
            </tr>
          </thead>
          <tbody>
            {regimes.map((r) => (
              <tr key={r.symbol} className="border-t border-zinc-900">
                <td className="py-1 font-semibold">{r.symbol}</td>
                {[r.trend_score, r.breadth_score, r.intermarket_score, r.positioning_score, r.narrative_score].map((v, i) => (
                  <td key={i} className={v == null ? "text-zinc-600" : v >= 60 ? "text-green-400" : v <= 40 ? "text-red-400" : ""}>
                    {v ?? "n/a"}
                  </td>
                ))}
                <td className="font-bold">{r.composite_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Breadth internals" tag="leading" asOf={breadth[0]?.as_of}>
          <table className="w-full text-xs">
            <thead className="text-zinc-500 text-left">
              <tr><th className="py-1">Index</th><th>Adv/Dec</th><th>%&gt;50d</th><th>%&gt;200d</th><th>52w H/L</th><th>McClellan</th><th>Divergence</th></tr>
            </thead>
            <tbody>
              {breadth.map((b: Record<string, any>) => (
                <tr key={b["symbol"]} className="border-t border-zinc-900">
                  <td className="py-1 font-semibold">{b["symbol"]}</td>
                  <td>{b["advancers"]}/{b["decliners"]}</td>
                  <td>{fmtNum(b["pct_above_50d"], 0)}%</td>
                  <td>{fmtNum(b["pct_above_200d"], 0)}%</td>
                  <td>{b["new_highs_52w"]}/{b["new_lows_52w"]}</td>
                  <td>{fmtNum(b["mcclellan_osc"], 0)}</td>
                  <td>{b["breadth_divergence"] ? <span className="text-red-400 font-semibold">YES</span> : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Intermarket (13-week change)" tag="leading" asOf={intermarket[0]?.week_end}>
          <table className="w-full text-xs">
            <thead className="text-zinc-500 text-left">
              <tr><th className="py-1">Instrument</th><th>Role</th><th>Last</th><th>13w Δ</th></tr>
            </thead>
            <tbody>
              {intermarket.map((m: Record<string, any>) => {
                const chg = m["close_13w_ago"] != null ? (m["close"] as number) / (m["close_13w_ago"] as number) - 1 : null;
                return (
                  <tr key={m["symbol"]} className="border-t border-zinc-900">
                    <td className="py-1 font-semibold">{m["symbol"]}</td>
                    <td className="text-zinc-400">{m["role"]}</td>
                    <td>{fmtNum(m["close"], 1)}</td>
                    <td className={chg != null && chg > 0 ? "text-green-400" : "text-red-400"}>{fmtPct(chg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Macro snapshot (latest observation per series)">
        <table className="w-full text-xs">
          <thead className="text-zinc-500 text-left">
            <tr><th className="py-1">Series</th><th></th><th>Country</th><th>Value</th><th>Obs date</th></tr>
          </thead>
          <tbody>
            {macro.map((m: Record<string, any>) => (
              <tr key={m["series_code"]} className="border-t border-zinc-900">
                <td className="py-1">{m["name"]}</td>
                <td><Tag kind={m["lead_lag"] ?? "coincident"} /></td>
                <td className="text-zinc-400">{m["country"]}</td>
                <td className="font-semibold">{fmtNum(m["value"], 2)}</td>
                <td className="text-zinc-500">{(m["obs_date"] as string)?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Pipeline health">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <table>
            <tbody>
              {health.freshness.map((f: Record<string, any>) => (
                <tr key={f["item"]} className="border-t border-zinc-900">
                  <td className="py-1 text-zinc-400">{f["item"]}</td>
                  <td>{f["latest"]}</td>
                  <td className={(f["days_behind"] as number) > 4 ? "text-amber-400" : "text-zinc-500"}>
                    {f["days_behind"]}d behind
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <tbody>
              {health.lastRuns.slice(0, 8).map((r: Record<string, any>) => (
                <tr key={r["job_name"]} className="border-t border-zinc-900">
                  <td className="py-1 text-zinc-400">{r["job_name"]}</td>
                  <td className={r["status"] === "success" ? "text-green-400" : r["status"] === "error" ? "text-red-400" : "text-zinc-400"}>
                    {r["status"]}
                  </td>
                  <td className="text-zinc-500">{(r["started_at"] as string)?.slice(5, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-zinc-600 mt-2">
          Tags: <Tag kind="leading" /> inputs move before price · <Tag kind="coincident" /> move with ·{" "}
          <Tag kind="lagging" /> confirm after. Signal detail: <Link className="underline" href="/screener">screener</Link>.
        </p>
      </Panel>
    </div>
  );
}
