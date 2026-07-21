import { notFound } from "next/navigation";
import { getStockDetail } from "../../../lib/data/queries";
import { getWatchlistSymbols } from "../../../lib/data/watchlist";
import { Panel, fmtNum } from "../../../components/ui";
import { WatchStar } from "../../../components/watch-star";
import { StockChart } from "./chart";

export const dynamic = "force-dynamic";

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const [detail, watchSymbols] = await Promise.all([
    getStockDetail(decodeURIComponent(symbol)),
    getWatchlistSymbols(),
  ]);
  if (!detail) notFound();
  const { instrument, bars, snapshots, signal, events } = detail;
  const latest = snapshots.at(-1);
  const factors = signal?.sub_scores?.factors as Record<string, number | null> | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <WatchStar symbol={instrument.symbol} inList={watchSymbols.has(instrument.symbol)} />
        <h1 className="text-lg font-bold">{instrument.symbol}</h1>
        <span className="text-sm text-zinc-400">{instrument.name}</span>
        <span className="text-xs text-zinc-500">{instrument.metadata?.sector ?? ""} · {instrument.currency}</span>
        {signal && (
          <span
            className={`px-2 py-0.5 rounded border text-xs font-semibold ${
              signal.direction === "bullish" ? "border-green-800 text-green-300"
              : signal.direction === "bearish" ? "border-red-800 text-red-300"
              : "border-zinc-700 text-zinc-300"
            }`}
          >
            {signal.direction} · conviction {Math.round(signal.conviction)}
            {signal.gated ? " · GATED" : ""}{signal.event_blackout ? " · BLACKOUT" : ""}
          </span>
        )}
        {events.map((e: { event_name: string; release_at: string }, i: number) => (
          <span key={i} className="text-xs text-sky-300">📅 {e.event_name.replace("Earnings: ", "earnings ")} {e.release_at.slice(0, 10)}</span>
        ))}
      </div>

      <Panel title="Weekly chart (adjusted) — Bollinger 20/2σ, 30w & 40w MAs, volume, RSI, MACD" asOf={bars.at(-1)?.time}>
        <StockChart bars={bars} snapshots={snapshots} />
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Signal decomposition" asOf={signal?.as_of_date}>
          {factors ? (
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(factors).map(([k, v]) => (
                  <tr key={k} className="border-t border-zinc-900">
                    <td className="py-1 text-zinc-400">{k}</td>
                    <td className={v != null && v > 0.3 ? "text-green-400" : v != null && v < -0.3 ? "text-red-400" : ""}>
                      {v == null ? "–" : v.toFixed(2)}
                    </td>
                    <td className="w-40">
                      {v != null && (
                        <div className="h-1.5 bg-zinc-800 rounded relative">
                          <div
                            className={`absolute top-0 h-1.5 rounded ${v >= 0 ? "bg-green-600" : "bg-red-600"}`}
                            style={{ left: v >= 0 ? "50%" : `${50 + v * 50}%`, width: `${Math.abs(v) * 50}%` }}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-700 font-semibold">
                  <td className="py-1">composite</td>
                  <td colSpan={2}>{signal.composite_score}</td>
                </tr>
                {signal.gate_reason && (
                  <tr><td colSpan={3} className="text-amber-400 pt-1">gate: {signal.gate_reason}</td></tr>
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
                  <tr key={k} className="border-t border-zinc-900">
                    <td className="py-1 text-zinc-400">{k}</td>
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
