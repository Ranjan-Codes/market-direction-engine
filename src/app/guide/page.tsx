import Link from "next/link";
import { Panel } from "../../components/ui";

/** The methodology, written for the reader — how the layers fit together
 *  and how to act on what the app shows. */
export default function GuidePage() {
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-lg font-bold">
        How to read this app{" "}
        <span className="text-xs font-normal text-zinc-500">
          the methodology in plain English — every panel also has its own ⓘ note
        </span>
      </h1>

      <Panel title="The one-sentence version">
        <p className="text-sm text-zinc-700">
          This app watches for markets that are <b>stretched</b> — overbought or oversold — and warns, with
          evidence and a catalyst schedule, when a reversal is likely within the next 2–6 weeks; everything
          else exists to support, corroborate, or act on that warning.
        </p>
      </Panel>

      <Panel title="The four layers and how they fit">
        <ol className="text-xs text-zinc-700 space-y-2 list-decimal pl-4">
          <li>
            <b>Layer 1 — Market regime (the gate).</b> Per index, five families of evidence (trend, breadth,
            intermarket, positioning, narrative) blend into a 0–100 composite: ≥60 risk-on, ≤40 risk-off.
            The market&apos;s tide. On top sits the <b>reversal-risk gauge</b> — the headline dial — which
            fires when stretch evidence accumulates (see <Link href="/" className="underline">Regime</Link>).
          </li>
          <li>
            <b>Layer 2 — Weekly technicals per stock.</b> Every index member gets RSI, MACD, Bollinger,
            ADX, volume, relative strength, 52-week range — computed on weekly bars because the horizon is
            weeks, not days.
          </li>
          <li>
            <b>Layer 3 — Signals.</b> The technicals blend into a per-stock direction + conviction, then two
            filters apply: the <b>regime gate</b> (&quot;don&apos;t fight the tape&quot; — bullish setups are
            suppressed when the tide is hostile) and the <b>event blackout</b> (no fresh entries within 5
            days of a big release or the stock&apos;s own earnings). See{" "}
            <Link href="/screener" className="underline">Screener</Link>.
          </li>
          <li>
            <b>Layer 4 — Validation.</b> The same code replayed over history tells you how often this works
            and where it doesn&apos;t (<Link href="/backtest" className="underline">Backtest</Link>). Its
            headline finding: signals earn ~+1%/4w in risk-on regimes and lose heavily in risk-off — the
            gate is the point.
          </li>
        </ol>
      </Panel>

      <Panel title="Leading vs coincident vs lagging — why the tags matter">
        <p className="text-xs text-zinc-700">
          Every input is tagged. <b className="text-amber-700">Leading</b> inputs (breadth divergences, RSI
          divergences, credit spreads, yield curve, positioning extremes, narrative extremes) tend to turn{" "}
          <i>before</i> price — they are why this app can warn early, and also why its warnings are
          probabilistic: leading indicators are early, sometimes too early.{" "}
          <b className="text-sky-700">Coincident</b> inputs (price vs moving averages, MACD) confirm what is
          already happening — they keep the leading inputs honest. <b className="text-zinc-600">Lagging</b>{" "}
          inputs (CPI, unemployment) matter through the policy response they provoke. A disciplined read:
          act on leading evidence only when it clusters (several independent warnings at once — which is
          exactly what the gauge intensity measures), and use coincident evidence to time it.
        </p>
      </Panel>

      <Panel title="How to use it — a weekly routine">
        <ol className="text-xs text-zinc-700 space-y-1.5 list-decimal pl-4">
          <li>
            <b>Start at Regime.</b> Note each index&apos;s regime badge and gauge. Gauge quiet → step 3.
          </li>
          <li>
            <b>If a gauge is firing</b>: read its evidence bullets, then the catalyst list. Overbought +
            catalyst-dense fortnight → consider trimming extended winners (your{" "}
            <Link href="/watchlist" className="underline">Watchlist</Link> flags which of your names are the
            extended ones), tightening stops, delaying fresh buys. Oversold → build the shopping list from
            the screener&apos;s strongest names.
          </li>
          <li>
            <b>Screener</b>: filter Actionable + bullish for candidates; check each name&apos;s chart and
            decomposition before acting. Treat bearish rows as avoid/trim, not shorts.
          </li>
          <li>
            <b>Calendar</b>: know what&apos;s scheduled before you commit — anything inside the amber window
            can gap against you.
          </li>
          <li>
            <b>Friday/weekend</b>: the full weekly recompute lands; alerts arrive as GitHub issues when
            something changed. Export the <Link href="/report" className="underline">Report</Link> if you
            want the snapshot on paper.
          </li>
        </ol>
      </Panel>

      <Panel title="Glossary — the indicators in one line each">
        <table className="w-full text-xs text-zinc-700">
          <tbody>
            {(
              [
                ["RSI (14w)", "momentum 0–100; >70 overbought, <30 oversold; its divergences vs price are the leading signal"],
                ["MACD", "trend momentum via moving-average gaps; histogram sign flips = momentum turning"],
                ["Bollinger bands (20w, 2σ)", "volatility envelope; %B = position in band; squeeze = coiled spring; band-walk = strong trend"],
                ["30w / 40w MA", "the weekly versions of the 150/200-day institutional trend lines; golden/death cross when they cross"],
                ["ADX / DMI", "trend strength (not direction); low ADX = chop, momentum signals muted"],
                ["Mansfield RS", "stock performance relative to its benchmark index (its own index, or SPX/UKX for off-index names) vs its 52-week norm; positive = leader"],
                ["OBV / A-D line", "cumulative volume flow; should confirm price — quiet accumulation/distribution shows here first"],
                ["ATR", "average weekly range — how much the stock moves; context for stops/sizing"],
                ["A/D breadth line", "cumulative advancers minus decliners across the index — participation"],
                ["McClellan oscillator", "EMA momentum of net advances; negative near index highs = narrowing leadership"],
                ["High-Low index", "new 52w highs vs lows, smoothed; below 50 = more lows than highs"],
                ["COT positioning", "futures net positioning of speculators; extremes are contrarian (crowded trades reverse)"],
                ["FinBERT tone", "language-model sentiment of headlines, −1..+1; trend and extremes matter, level doesn't"],
                ["Conviction", "0–100 strength of a stock's weighted factor blend; not a probability"],
                ["Gauge intensity", "0–100 share of weighted reversal evidence present; fires at ≥25"],
              ] as Array<[string, string]>
            ).map(([term, def]) => (
              <tr key={term} className="border-t border-zinc-200 align-top">
                <td className="py-1 pr-3 font-semibold whitespace-nowrap">{term}</td>
                <td className="py-1 text-zinc-600">{def}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="What this app is not">
        <ul className="text-xs text-zinc-600 space-y-1 list-disc pl-4">
          <li>Not investment advice and not a trading system — it is decision support; you decide.</li>
          <li>Not a day-trading tool — everything is built on weekly bars for a 2–6 week horizon.</li>
          <li>
            Not certain — the backtest page shows the honest hit rates (mid-50s% at best); the edge comes
            from expectancy and from avoiding hostile regimes, not from being right every time.
          </li>
          <li>
            Not free of data caveats — membership history before mid-2026 uses current members (survivorship
            bias), narrative history is young, and free data sources can go stale (the dashboard tells you
            when).
          </li>
        </ul>
      </Panel>
    </div>
  );
}
