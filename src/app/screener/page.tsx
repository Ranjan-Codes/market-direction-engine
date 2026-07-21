import { getSignals } from "../../lib/data/queries";
import { getWatchlistSymbols } from "../../lib/data/watchlist";
import { HelpNote } from "../../components/ui";
import { ScreenerTable } from "./table";

export const dynamic = "force-dynamic";

export default async function ScreenerPage() {
  const [signals, watchSymbols] = await Promise.all([getSignals(), getWatchlistSymbols()]);
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">
        Signal screener{" "}
        <span className="text-xs font-normal text-zinc-500">
          week ending {signals[0]?.as_of_date} · {signals.length} constituents · 2–6 week horizon ·{" "}
          <a href="/api/export/signals" className="underline">export CSV</a>
        </span>
      </h1>
      <div className="border border-zinc-800 rounded bg-zinc-950">
        <HelpNote>
          Every index constituent gets a weekly signal from seven weighted factors, each scored in [-1, +1]:
          <b> trendMa</b> (price vs 30/40-week averages and fresh golden/death crosses), <b>momentum</b>
          (weekly MACD + RSI, muted when ADX says the stock is chopping), <b>divergence</b> (weekly RSI
          divergence — the leading factor: −1 bearish, +1 bullish), <b>relativeStrength</b> (Mansfield RS —
          is it beating its own index), <b>volume</b> (whether volume confirms the price move),{" "}
          <b>bollinger</b> (band-walks and squeezes), <b>range</b> (position in the 52-week range, damped at
          extremes). <b>Conviction</b> (0–100) is the strength of the weighted blend. <b>Status</b>: ✓ =
          actionable now; <b>GATED</b> = a good setup the market regime refuses — &quot;don&apos;t fight the
          tape&quot; (hover for the reason); <b>BLACKOUT</b> = high-importance release or the stock&apos;s own
          earnings within 5 days — wait for the event. Practical use: filter <i>Actionable + bullish</i>,
          sort stays by conviction; treat <i>bearish</i> rows as avoid/trim flags rather than shorts (the
          backtest found short signals unreliable in this dataset). Click ☆ to track a name on the
          watchlist, or the symbol for its chart.
        </HelpNote>
      </div>
      <ScreenerTable signals={signals} watchSymbols={[...watchSymbols]} />
    </div>
  );
}
