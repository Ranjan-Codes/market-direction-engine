"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { TopConstituent } from "../lib/data/queries";

const FACTOR_LABELS: Record<string, string> = {
  trendMa: "Trend", momentum: "Momentum", divergence: "Divergence",
  relativeStrength: "Rel Str", volume: "Volume", bollinger: "Bollinger", range: "Range",
};

function topDriver(factors: Record<string, number | null> | null): { label: string; value: number } | null {
  if (!factors) return null;
  let best: { label: string; value: number } | null = null;
  for (const [k, v] of Object.entries(factors)) {
    if (v == null) continue;
    if (!best || Math.abs(v) > Math.abs(best.value)) best = { label: FACTOR_LABELS[k] ?? k, value: v };
  }
  return best;
}

function fmtCap(v: number | null): string {
  if (v == null) return "–";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function MiniSparkline({ prices }: { prices: number[] | null }) {
  if (!prices || prices.length < 2) return <span className="text-zinc-400 dark:text-zinc-600">–</span>;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const w = 36, h = 16;
  const pts = prices
    .map((v, i) => `${((i / (prices.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(" ");
  const up = prices[prices.length - 1] >= prices[0];
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke={up ? "#10b981" : "#ef4444"} strokeWidth={1.5} />
    </svg>
  );
}

type SortKey = "rank" | "symbol" | "cap" | "price" | "chg" | "signal" | "rsi";
type SortDir = "asc" | "desc";

const SIGNAL_ORDER: Record<string, number> = { bullish: 3, caution: 2, neutral: 1, bearish: 0 };

function getSortValue(s: TopConstituent, key: SortKey, idx: number): number | string {
  switch (key) {
    case "rank": return idx;
    case "symbol": return s.symbol;
    case "cap": return s.market_cap ?? -1;
    case "price": return s.close ?? -1;
    case "chg": return s.change_pct ?? -999;
    case "signal": return SIGNAL_ORDER[s.direction ?? "neutral"] ?? 1;
    case "rsi": return s.rsi_14 ?? -1;
  }
}

export function TopTable({ stocks, indexSymbol: _indexSymbol }: { stocks: TopConstituent[]; indexSymbol: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState<string>("all");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "rank" || key === "symbol" ? "asc" : "desc");
    }
  }

  const sorted = useMemo(() => {
    const list = filter === "all" ? stocks : stocks.filter((s) => s.direction === filter);
    const indexed = list.map((s, i) => ({ s, origIdx: i }));
    indexed.sort((a, b) => {
      const av = getSortValue(a.s, sortKey, a.origIdx);
      const bv = getSortValue(b.s, sortKey, b.origIdx);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return indexed.map((x) => x.s);
  }, [stocks, sortKey, sortDir, filter]);

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const thCls = "px-1.5 py-1.5 cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          Top 20 by Market Cap
        </h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-[10px] bg-transparent border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5 text-zinc-600 dark:text-zinc-400 cursor-pointer"
        >
          <option value="all">All signals</option>
          <option value="bullish">Bullish</option>
          <option value="bearish">Bearish</option>
          <option value="neutral">Neutral</option>
          <option value="caution">Caution</option>
        </select>
      </div>
      <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-700 rounded-lg">
        <table className="w-full text-[11px]">
          <thead className="text-zinc-500 dark:text-zinc-400 text-left bg-zinc-50/80 dark:bg-zinc-800/60">
            <tr>
              <th className={`pl-2 pr-1 ${thCls} w-5`} onClick={() => handleSort("rank")}>#{ arrow("rank")}</th>
              <th className={thCls} onClick={() => handleSort("symbol")}>Ticker{arrow("symbol")}</th>
              <th className="px-1.5 py-1.5">Company</th>
              <th className={`${thCls} text-right`} onClick={() => handleSort("cap")}>Cap{arrow("cap")}</th>
              <th className={`${thCls} text-right`} onClick={() => handleSort("price")}>Price{arrow("price")}</th>
              <th className={`${thCls} text-right`} onClick={() => handleSort("chg")}>Chg%{arrow("chg")}</th>
              <th className="px-1.5 py-1.5">5d</th>
              <th className={thCls} onClick={() => handleSort("signal")}>Signal{arrow("signal")}</th>
              <th className="px-1.5 py-1.5">Driver</th>
              <th className={`${thCls} text-right`} onClick={() => handleSort("rsi")}>RSI{arrow("rsi")}</th>
              <th className="px-1.5 py-1.5">52w</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const driver = topDriver(s.factors);
              const changed = s.prev_direction && s.direction && s.prev_direction !== s.direction;
              return (
                <tr key={s.symbol} className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                  <td className="pl-2 pr-1 py-1 text-zinc-400 dark:text-zinc-500">{i + 1}</td>
                  <td className="px-1.5 py-1 font-semibold text-zinc-900 dark:text-zinc-100">
                    <Link href={`/stock/${encodeURIComponent(s.symbol)}`} className="hover:underline">
                      {s.symbol}
                    </Link>
                  </td>
                  <td className="px-1.5 py-1 text-zinc-600 dark:text-zinc-400 max-w-[120px] truncate">{s.name ?? "–"}</td>
                  <td className="px-1.5 py-1 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{fmtCap(s.market_cap)}</td>
                  <td className="px-1.5 py-1 text-right tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                    {s.close != null ? s.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–"}
                  </td>
                  <td className={`px-1.5 py-1 text-right tabular-nums font-medium ${
                    s.change_pct != null && s.change_pct > 0 ? "text-emerald-600 dark:text-emerald-400" : s.change_pct != null && s.change_pct < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-500"
                  }`}>
                    {s.change_pct != null ? `${s.change_pct >= 0 ? "+" : ""}${(s.change_pct * 100).toFixed(1)}%` : "–"}
                  </td>
                  <td className="px-1.5 py-1">
                    <MiniSparkline prices={s.spark_prices} />
                  </td>
                  <td className="px-1.5 py-1">
                    <span className={`font-semibold ${
                      s.direction === "bullish" ? "text-emerald-700 dark:text-emerald-400" : s.direction === "bearish" ? "text-red-700 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"
                    }`}>
                      {s.direction ?? "–"}
                    </span>
                    {changed && (
                      <span className="ml-1 px-1 py-px rounded text-[8px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 uppercase">
                        flip
                      </span>
                    )}
                  </td>
                  <td className="px-1.5 py-1">
                    {driver ? (
                      <span className={`text-[10px] font-medium ${driver.value > 0 ? "text-emerald-600 dark:text-emerald-400" : driver.value < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                        {driver.label}
                      </span>
                    ) : "–"}
                  </td>
                  <td className={`px-1.5 py-1 text-right tabular-nums ${
                    s.rsi_14 != null && s.rsi_14 > 70 ? "text-red-600 dark:text-red-400 font-semibold" : s.rsi_14 != null && s.rsi_14 < 30 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-zinc-700 dark:text-zinc-300"
                  }`}>
                    {s.rsi_14 != null ? s.rsi_14.toFixed(0) : "–"}
                  </td>
                  <td className="px-1.5 py-1">
                    {s.pos_52w_range != null ? (
                      <div className="flex items-center gap-1">
                        <div className="w-10 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${s.pos_52w_range > 0.8 ? "bg-emerald-500" : s.pos_52w_range < 0.2 ? "bg-red-500" : "bg-zinc-400 dark:bg-zinc-500"}`}
                            style={{ width: `${Math.min(s.pos_52w_range * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{(s.pos_52w_range * 100).toFixed(0)}%</span>
                      </div>
                    ) : "–"}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={11} className="text-center py-3 text-zinc-400 dark:text-zinc-600">No stocks match filter</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[9px] text-zinc-400 dark:text-zinc-600 mt-1">
        Click column headers to sort. Driver = strongest signal factor. FLIP badge = signal changed in the last 7 days.
      </p>
    </div>
  );
}
