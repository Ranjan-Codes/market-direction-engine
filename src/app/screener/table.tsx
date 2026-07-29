"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SignalRow } from "../../lib/data/queries";
import { WatchStar } from "../../components/watch-star";

const FACTORS = ["trendMa", "momentum", "divergence", "relativeStrength", "volume", "bollinger", "range"] as const;

function cellColor(v: number | null | undefined): string {
  if (v == null) return "text-zinc-400";
  if (v > 0.3) return "text-green-700";
  if (v < -0.3) return "text-red-700";
  return "text-zinc-600";
}

export function ScreenerTable({
  signals,
  watchSymbols,
}: {
  signals: SignalRow[];
  watchSymbols: string[];
}) {
  const watched = useMemo(() => new Set(watchSymbols), [watchSymbols]);
  const [index, setIndex] = useState("all");
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");
  const [minConviction, setMinConviction] = useState(0);
  const [showFactors, setShowFactors] = useState(false);

  const filtered = useMemo(
    () =>
      signals.filter(
        (s) =>
          (index === "all" || s.index_symbol === index) &&
          (direction === "all" || s.direction === direction) &&
          (status === "all" ||
            (status === "actionable" && !s.gated && !s.event_blackout && s.direction !== "neutral") ||
            (status === "gated" && s.gated) ||
            (status === "blackout" && s.event_blackout)) &&
          s.conviction >= minConviction,
      ),
    [signals, index, direction, status, minConviction],
  );

  const sel = "bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs shadow-sm focus:ring-1 focus:ring-zinc-300 focus:outline-none";
  return (
    <div>
      <div className="flex gap-2.5 mb-3 items-center text-xs flex-wrap">
        <select className={sel} value={index} onChange={(e) => setIndex(e.target.value)}>
          <option value="all">All indices</option>
          <option>SPX</option><option>NDX</option><option>UKX</option>
        </select>
        <select className={sel} value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="all">All directions</option>
          <option>bullish</option><option>bearish</option><option>neutral</option>
        </select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="actionable">Actionable</option>
          <option value="gated">Gated</option>
          <option value="blackout">Event blackout</option>
        </select>
        <label className="text-zinc-600">
          Min conviction{" "}
          <input
            type="number" min={0} max={100} value={minConviction}
            onChange={(e) => setMinConviction(Number(e.target.value))}
            className={`${sel} w-16`}
          />
        </label>
        <label className="text-zinc-600 flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={showFactors}
            onChange={(e) => setShowFactors(e.target.checked)}
          />
          factor detail
        </label>
        <span className="text-zinc-500 ml-auto">{filtered.length} rows</span>
      </div>

      <div className="overflow-x-auto border border-zinc-200 rounded-xl shadow-sm bg-white">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="text-zinc-500 text-left bg-zinc-50/80 sticky top-0">
            <tr>
              <th className="px-1.5 py-2 w-6"></th>
              <th className="px-2 py-2">Symbol</th>
              <th className="px-2 py-2">Company</th>
              <th className="px-2 py-2">Index</th>
              <th className="px-2 py-2">Sector</th>
              <th className="px-2 py-2">Signal</th>
              <th className="px-2 py-2">Conv</th>
              {showFactors && FACTORS.map((f) => <th key={f} className="px-1.5 py-2">{f}</th>)}
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 400).map((s) => (
              <tr key={s.symbol} className="border-t border-zinc-100 hover:bg-zinc-50/60 transition-colors">
                <td className="px-1.5 py-1.5">
                  <WatchStar symbol={s.symbol} inList={watched.has(s.symbol)} />
                </td>
                <td className="px-2 py-1.5 font-semibold">
                  <Link href={`/stock/${encodeURIComponent(s.symbol)}`} className="hover:underline">
                    {s.symbol}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-zinc-500 max-w-[180px] truncate">{s.name ?? "–"}</td>
                <td className="px-2 text-zinc-600">{s.index_symbol}</td>
                <td className="px-2 text-zinc-500 max-w-[140px] truncate">{s.sector}</td>
                <td
                  className={`px-2 ${
                    s.direction === "bullish" ? "text-emerald-700 font-semibold"
                    : s.direction === "bearish" ? "text-red-700 font-semibold"
                    : "text-zinc-500"
                  }`}
                >
                  {s.direction}
                </td>
                <td className="px-2 font-bold">{Math.round(s.conviction)}</td>
                {showFactors && FACTORS.map((f) => (
                  <td key={f} className={`px-1.5 ${cellColor(s.factors?.[f])}`}>
                    {s.factors?.[f] == null ? "–" : s.factors[f]!.toFixed(2)}
                  </td>
                ))}
                <td className="px-2">
                  {s.gated && <span className="text-amber-600 font-medium" title={s.gate_reason ?? ""}>GATED</span>}
                  {s.event_blackout && (
                    <span className="text-sky-600 font-medium ml-1" title={s.upcoming_events.map((e) => e.event_name).join(", ")}>
                      BLACKOUT
                    </span>
                  )}
                  {!s.gated && !s.event_blackout && s.direction !== "neutral" && (
                    <span className="text-emerald-600 font-medium">✓</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-zinc-400 mt-1">
        Gated = regime blocks fresh entries (shown, not hidden). Blackout = high-importance release or own
        earnings within 5 days. Factor cells are the weighted model inputs in [-1, +1].
      </p>
    </div>
  );
}
