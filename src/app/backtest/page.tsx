import { getBacktestReport } from "../../lib/data/queries";
import { Panel, HelpNote, fmtNum, fmtPct } from "../../components/ui";

export const dynamic = "force-dynamic";

const GROUPS: Array<[string, string]> = [
  ["overall", "Overall"],
  ["signal_type", "By signal type"],
  ["regime", "By regime at entry"],
  ["index", "By index"],
  ["walk_forward", "Stability split"],
  ["gauge", "Reversal-risk gauge (north-star)"],
];

export default async function BacktestPage() {
  const report = await getBacktestReport();
  if (!report) return <p className="text-sm text-zinc-600">No successful backtest run yet.</p>;
  const { run, results } = report;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">
        Backtest / validation{" "}
        <span className="text-xs font-normal text-zinc-500">
          run #{run.id} · weights {run.weights_version} · {run.period_start} → {run.period_end}
        </span>
      </h1>

      <div className="border border-zinc-200 rounded-xl bg-white shadow-sm">
        <HelpNote>
          The honesty page: the live signal code replayed over history with strict point-in-time data.
          Column meanings — <b>n</b>: signal-weeks in the segment. <b>Hit</b>: % that moved the signalled
          direction over 4 weeks (50% = coin flip; sustained 53–55% with positive averages is a real edge at
          this horizon). <b>Avg 2w/4w/6w</b>: average signed forward return per signal. <b>Expectancy</b>:
          average P&L per signal combining win rate and win/loss sizes — the single best summary number.
          <b> PF</b> (profit factor): gross wins ÷ gross losses; above 1.2 decent, below 1 loses money.
          <b> Max DD</b>: worst peak-to-trough of an equal-weighted strategy of these signals. How to read
          the groups: <i>by regime</i> shows why the gate exists (same signals, +1%/4w in risk-on vs −8.7%
          in risk-off); <i>gauge</i> rows must be compared against <i>baseline-all-index-weeks</i> — the
          gauge&apos;s value is that post-warning weeks average far below the baseline drift. Read the
          caveats panel before trusting any row.
        </HelpNote>
      </div>

      {GROUPS.map(([type, label]) => {
        const rows = results.filter((r: { segment_type: string }) => r.segment_type === type);
        if (rows.length === 0) return null;
        return (
          <Panel key={type} title={label}>
            <table className="w-full text-xs">
              <thead className="text-zinc-500 text-left">
                <tr>
                  <th className="py-1">Segment</th><th>n</th><th>Hit</th>
                  <th>Avg 2w</th><th>Avg 4w</th><th>Avg 6w</th>
                  <th>Expectancy</th><th>PF</th><th>Max DD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: Record<string, any>) => (
                  <tr key={r["segment_key"]} className="border-t border-zinc-200">
                    <td className="py-1">{r["segment_key"]}</td>
                    <td className="text-zinc-600">{r["n_signals"]}</td>
                    <td>{r["hit_rate"] != null ? `${(r["hit_rate"] * 100).toFixed(0)}%` : "–"}</td>
                    {(["avg_fwd_return_2w", "avg_fwd_return_4w", "avg_fwd_return_6w"] as const).map((k) => (
                      <td key={k} className={r[k] > 0 ? "text-green-700" : r[k] < 0 ? "text-red-700" : ""}>
                        {fmtPct(r[k], 2)}
                      </td>
                    ))}
                    <td>{fmtPct(r["expectancy"], 2)}</td>
                    <td>{fmtNum(r["profit_factor"], 2)}</td>
                    <td className="text-zinc-600">{fmtPct(r["max_drawdown"], 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        );
      })}

      <Panel title="Caveats recorded with this run">
        <ul className="text-xs text-zinc-600 space-y-1 list-disc pl-4">
          {((run.config?.caveats as string[]) ?? []).map((c, i) => <li key={i}>{c}</li>)}
          <li>
            Gauge &quot;hit&quot; means the index moved in the warned direction; compare warning rows against the
            baseline-all-index-weeks row — the edge is relative underperformance after warnings.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
