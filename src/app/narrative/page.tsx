import { getNarrative } from "../../lib/data/queries";
import { Panel, Sparkline, HelpNote, fmtNum } from "../../components/ui";

export const dynamic = "force-dynamic";

export default async function NarrativePage() {
  const { tone, themes, headlines, froth } = await getNarrative();
  const toneBy = (key: string) => tone.filter((t: { scope_key: string }) => t.scope_key === key);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">
        Narrative & sentiment{" "}
        <span className="text-xs font-normal text-zinc-500">
          FinBERT-scored headlines · GDELT tone · retail gauges — the noisiest layer, capped at 15% of the
          regime composite pending backtest evidence
        </span>
      </h1>

      <div className="border border-zinc-200 rounded-xl bg-white shadow-sm">
        <HelpNote>
          Headlines from major outlets and central banks are scored by FinBERT (a finance-tuned language
          model) from −1 (bearish tone) to +1 (bullish). <b>Market tone</b>: the daily average per market —
          the level matters less than the <i>trend</i> and the <i>extremes</i>; persistently euphoric tone
          near market highs is a contrarian warning, despair near lows precedes rebounds. <b>Theme tone</b>:
          the same scores bucketed by macro theme — watch how tone on an upcoming release&apos;s theme (e.g.
          inflation before CPI) drifts: that&apos;s the market pre-positioning. <b>Retail gauge</b>:
          StockTwits message sentiment; readings near +1 mean one-sided retail bullishness — contrarian, not
          confirmation. Caveat honestly displayed: headline-level scoring sometimes misreads good news about
          bad things (&quot;deficit decreased&quot; scores negative), which is one reason this whole layer is
          capped at 15% of the regime composite.
        </HelpNote>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {["US", "UK"].map((mkt) => {
          const series = toneBy(mkt);
          const latest = series.at(-1);
          return (
            <Panel key={mkt} title={`${mkt} market tone (daily avg FinBERT score)`} asOf={latest?.date}>
              <div className="flex items-center gap-4">
                <span className={`text-2xl font-bold ${latest && latest.score > 0.05 ? "text-green-700" : latest && latest.score < -0.05 ? "text-red-700" : "text-zinc-700"}`}>
                  {latest ? fmtNum(latest.score, 3) : "–"}
                </span>
                <Sparkline values={series.map((t: { score: number }) => t.score)} baseline={0} width={220} height={40} />
                <span className="text-xs text-zinc-500">{series.length} days · vol {latest?.volume ?? "–"} items/day</span>
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Theme tone (trailing 7 days)">
          <table className="w-full text-xs">
            <thead className="text-zinc-500 text-left"><tr><th className="py-1">Theme</th><th>Tone</th><th>Items</th></tr></thead>
            <tbody>
              {themes.map((t: Record<string, any>) => (
                <tr key={t["scope_key"]} className="border-t border-zinc-200">
                  <td className="py-1">{t["scope_key"]}</td>
                  <td className={t["tone"] > 0.1 ? "text-green-700" : t["tone"] < -0.1 ? "text-red-700" : "text-zinc-700"}>
                    {fmtNum(t["tone"], 3)}
                  </td>
                  <td className="text-zinc-500">{t["items"]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Retail gauge — StockTwits bull/bear (contrarian at extremes)">
          <table className="w-full text-xs">
            <thead className="text-zinc-500 text-left"><tr><th className="py-1">Symbol</th><th>Bull−Bear</th><th>Sample</th></tr></thead>
            <tbody>
              {froth.map((f: Record<string, any>) => (
                <tr key={f["scope_key"]} className="border-t border-zinc-200">
                  <td className="py-1 font-semibold">{f["scope_key"]}</td>
                  <td className={f["bull_bear"] > 0.6 ? "text-amber-600 font-semibold" : f["bull_bear"] < -0.3 ? "text-red-700" : "text-zinc-700"}>
                    {fmtNum(f["bull_bear"], 2)}
                    {f["bull_bear"] > 0.8 && " ⚠ one-sided"}
                  </td>
                  <td className="text-zinc-500">{f["volume"]} msgs</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-zinc-400 mt-2">
            Reddit froth gauge pending API registration approval.
          </p>
        </Panel>
      </div>

      <Panel title="Latest scored headlines (headlines only — never article bodies)">
        <table className="w-full text-xs">
          <thead className="text-zinc-500 text-left">
            <tr><th className="py-1 w-14">Score</th><th className="w-10">Mkt</th><th>Headline</th><th className="w-28">Source</th><th className="w-24">When</th></tr>
          </thead>
          <tbody>
            {headlines.map((h: Record<string, any>, i: number) => (
              <tr key={i} className="border-t border-zinc-200">
                <td className={`py-1 font-semibold ${h["score"] > 0.3 ? "text-green-700" : h["score"] < -0.3 ? "text-red-700" : "text-zinc-600"}`}>
                  {fmtNum(h["score"], 2)}
                </td>
                <td className="text-zinc-500">{h["market"]}</td>
                <td>{h["headline"]}</td>
                <td className="text-zinc-500">{h["feed"]}</td>
                <td className="text-zinc-400">{(h["reading_at"] as string)?.slice(5, 16)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
