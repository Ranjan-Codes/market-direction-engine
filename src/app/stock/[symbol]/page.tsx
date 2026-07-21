import { notFound } from "next/navigation";
import Link from "next/link";
import { getStockDetail } from "../../../lib/data/queries";
import { TIMEFRAME_PARAMS, type Timeframe } from "../../../lib/compute/chart-overlays";
import { getWatchlistSymbols } from "../../../lib/data/watchlist";
import { Panel, fmtNum } from "../../../components/ui";
import { WatchStar } from "../../../components/watch-star";
import { StockChart } from "./chart";

export const dynamic = "force-dynamic";

export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ tf?: string }>;
}) {
  const { symbol } = await params;
  const { tf } = await searchParams;
  const timeframe: Timeframe = tf === "daily" || tf === "monthly" ? tf : "weekly";
  const [detail, watchSymbols] = await Promise.all([
    getStockDetail(decodeURIComponent(symbol), timeframe),
    getWatchlistSymbols(),
  ]);
  if (!detail) notFound();
  const { instrument, bars, overlays, snapshots, signal, events } = detail;
  const tfParams = TIMEFRAME_PARAMS[timeframe];
  const latest = snapshots.at(-1);
  const factors = signal?.sub_scores?.factors as Record<string, number | null> | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <WatchStar symbol={instrument.symbol} inList={watchSymbols.has(instrument.symbol)} />
        <h1 className="text-lg font-bold">{instrument.symbol}</h1>
        <span className="text-sm text-zinc-600">{instrument.name}</span>
        <span className="text-xs text-zinc-500">{instrument.metadata?.sector ?? ""} · {instrument.currency}</span>
        {signal && (
          <span
            className={`px-2 py-0.5 rounded border text-xs font-semibold ${
              signal.direction === "bullish" ? "border-green-300 text-green-800"
              : signal.direction === "bearish" ? "border-red-300 text-red-800"
              : "border-zinc-400 text-zinc-700"
            }`}
          >
            {signal.direction} · conviction {Math.round(signal.conviction)}
            {signal.gated ? " · GATED" : ""}{signal.event_blackout ? " · BLACKOUT" : ""}
          </span>
        )}
        {events.map((e: { event_name: string; release_at: string }, i: number) => (
          <span key={i} className="text-xs text-sky-700">📅 {e.event_name.replace("Earnings: ", "earnings ")} {e.release_at.slice(0, 10)}</span>
        ))}
      </div>

      <div className="flex items-center gap-1 text-xs">
        {(["daily", "weekly", "monthly"] as const).map((t) => (
          <Link
            key={t}
            href={`/stock/${encodeURIComponent(instrument.symbol)}${t === "weekly" ? "" : `?tf=${t}`}`}
            className={`px-3 py-1 rounded-full border ${
              t === timeframe
                ? "bg-zinc-800 text-white border-zinc-800"
                : "bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-100"
            }`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Link>
        ))}
        {timeframe === "daily" && (
          <span className="text-zinc-500 ml-2">daily history kept for ~3 years</span>
        )}
        {timeframe === "weekly" && (
          <span className="text-zinc-500 ml-2">the app&apos;s signals are computed on this frame</span>
        )}
      </div>

      <Panel
        title={`${timeframe[0].toUpperCase() + timeframe.slice(1)} chart (adjusted) — Bollinger, ${tfParams.maFastLabel} & ${tfParams.maSlowLabel}, volume, RSI, MACD`}
        asOf={bars.at(-1)?.time}
        help={
          <>
            Weekly candles with the institutional overlays: <b>yellow = 30-week MA, orange = 40-week MA</b>
            (the weekly equivalents of the 150/200-day) — price above rising MAs is an uptrend; the MAs
            crossing is the golden/death cross. <b>Purple bands</b>: Bollinger 20-week/2σ — price hugging
            the upper band (&quot;band-walk&quot;) is strength, but combined with RSI &gt; 70 it&apos;s
            stretch; narrow bands (squeeze) precede big moves in either direction. <b>Middle pane RSI</b>:
            above 70 overbought, below 30 oversold — the divergences (price high without an RSI high)
            matter more than the level. <b>Bottom pane MACD</b>: histogram flipping sign = momentum turning;
            line crossing signal confirms. Volume bars at the base of the price pane: rising volume in the
            move&apos;s direction confirms it.
          </>
        }
      >
        <StockChart
          bars={bars}
          overlays={overlays}
          maFastLabel={tfParams.maFastLabel}
          maSlowLabel={tfParams.maSlowLabel}
          unit={tfParams.unit}
        />
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel
          title="Signal decomposition"
          asOf={signal?.as_of_date}
          help={
            <>
              Exactly how this stock&apos;s signal was built: each factor in [-1, +1], bar shows direction
              and size; the composite is their weighted blend (weights in Settings). A big positive trendMa
              with negative divergence is the classic &quot;strong but tiring&quot; read. If a gate line
              appears, the setup is valid but the market regime blocks acting on it.
            </>
          }
        >
          {factors ? (
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(factors).map(([k, v]) => (
                  <tr key={k} className="border-t border-zinc-200">
                    <td className="py-1 text-zinc-600">{k}</td>
                    <td className={v != null && v > 0.3 ? "text-green-700" : v != null && v < -0.3 ? "text-red-700" : ""}>
                      {v == null ? "–" : v.toFixed(2)}
                    </td>
                    <td className="w-40">
                      {v != null && (
                        <div className="h-1.5 bg-zinc-200 rounded relative">
                          <div
                            className={`absolute top-0 h-1.5 rounded ${v >= 0 ? "bg-green-600" : "bg-red-600"}`}
                            style={{ left: v >= 0 ? "50%" : `${50 + v * 50}%`, width: `${Math.abs(v) * 50}%` }}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-400 font-semibold">
                  <td className="py-1">composite</td>
                  <td colSpan={2}>{signal.composite_score}</td>
                </tr>
                {signal.gate_reason && (
                  <tr><td colSpan={3} className="text-amber-600 pt-1">gate: {signal.gate_reason}</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-zinc-500">No signal row for this instrument.</p>
          )}
        </Panel>

        <Panel title="Latest weekly technicals" asOf={latest?.week_end}>
          {latest ? (
            <table className="w-full text-xs">
              <tbody>
                {(
                  [
                    ["RSI(14)", fmtNum(latest.rsi_14)],
                    ["MACD hist", fmtNum(latest.macd_hist, 2)],
                    ["ADX(14)", fmtNum(latest.adx_14)],
                    ["Mansfield RS vs index", fmtNum(latest.mansfield_rs)],
                    ["ATR(14)", fmtNum(latest.atr_14, 2)],
                    ["Support (13w)", fmtNum(latest.support, 2)],
                    ["Resistance (13w)", fmtNum(latest.resistance, 2)],
                  ] as Array<[string, string]>
                ).map(([k, v]) => (
                  <tr key={k} className="border-t border-zinc-200">
                    <td className="py-1 text-zinc-600">{k}</td>
                    <td className="font-semibold">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-zinc-500">No snapshots.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
