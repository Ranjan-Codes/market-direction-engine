"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SignalRow } from "../../lib/data/queries";
import { WatchStar } from "../../components/watch-star";

const FACTORS = [
  "trendMa", "momentum", "divergence", "relativeStrength",
  "volume", "bollinger", "range",
] as const;

/* ── Colors ──────────────────────────────────────────── */

function heatFill(bull: number, bear: number, total: number): string {
  if (total === 0) return "#94a3b8";
  const r = (bull - bear) / total;
  if (r > 0.4) return "#059669";
  if (r > 0.15) return "#34d399";
  if (r > -0.15) return "#94a3b8";
  if (r > -0.4) return "#f87171";
  return "#dc2626";
}

function convBarCls(v: number): string {
  if (v >= 75) return "bg-emerald-500 dark:bg-emerald-400";
  if (v >= 55) return "bg-sky-500 dark:bg-sky-400";
  if (v >= 35) return "bg-amber-500 dark:bg-amber-400";
  return "bg-zinc-400 dark:bg-zinc-500";
}

/* ── Summary Cards ───────────────────────────────────── */

function Card({ v, label, sub, icon, cls }: {
  v: number; label: string; sub: string; icon: string; cls: string;
}) {
  return (
    <div className={`border rounded-xl px-3 py-2 ${cls}`}>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-extrabold tabular-nums">{v}</span>
        {icon && <span className="text-xs">{icon}</span>}
        <span className="text-[10px] opacity-50 ml-auto">{sub}</span>
      </div>
      <div className="text-[10px] font-semibold mt-0.5 opacity-60 uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

function SummaryStrip({ signals }: { signals: SignalRow[] }) {
  const n = signals.length;
  const bull = signals.filter((s) => s.direction === "bullish").length;
  const bear = signals.filter((s) => s.direction === "bearish").length;
  const neut = n - bull - bear;
  const act = signals.filter(
    (s) => !s.gated && !s.event_blackout && s.direction !== "neutral",
  ).length;
  const avg =
    n > 0 ? Math.round(signals.reduce((a, s) => a + s.conviction, 0) / n) : 0;

  const bp = n ? ((bull / n) * 100).toFixed(0) : "0";
  const rp = n ? ((bear / n) * 100).toFixed(0) : "0";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Card v={bull} label="Bullish" sub={`${bp}%`} icon="▲"
          cls="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400" />
        <Card v={bear} label="Bearish" sub={`${rp}%`} icon="▼"
          cls="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400" />
        <Card v={neut} label="Neutral" sub={`${n ? ((neut / n) * 100).toFixed(0) : "0"}%`} icon="—"
          cls="bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400" />
        <Card v={act} label="Actionable" sub="clear" icon="✓"
          cls="bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-400" />
        <Card v={avg} label="Avg conviction" sub="/100" icon=""
          cls="bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400" />
      </div>
      <div
        className="h-2.5 flex rounded-full overflow-hidden"
        title={`${bull} bullish · ${bear} bearish · ${neut} neutral`}
      >
        <div className="bg-emerald-500 dark:bg-emerald-400" style={{ width: `${bp}%` }} />
        <div className="bg-red-500 dark:bg-red-400" style={{ width: `${rp}%` }} />
        <div className="bg-zinc-300 dark:bg-zinc-600 flex-1" />
      </div>
    </div>
  );
}

/* ── Sector Heatmap ──────────────────────────────────── */

interface SectorAgg {
  name: string;
  total: number;
  bull: number;
  bear: number;
  avgConv: number;
}

function SectorMap({
  signals,
  active,
  onClick,
}: {
  signals: SignalRow[];
  active: string;
  onClick: (s: string) => void;
}) {
  const W = 900;
  const H = 150;

  const rects = useMemo(() => {
    const m = new Map<string, SectorAgg>();
    for (const s of signals) {
      const k = s.sector || "Other";
      const a = m.get(k) ?? { name: k, total: 0, bull: 0, bear: 0, avgConv: 0 };
      a.total++;
      if (s.direction === "bullish") a.bull++;
      else if (s.direction === "bearish") a.bear++;
      a.avgConv += s.conviction;
      m.set(k, a);
    }
    for (const a of m.values()) a.avgConv = Math.round(a.avgConv / (a.total || 1));
    const sectors = [...m.values()].sort((a, b) => b.total - a.total);

    const totalN = sectors.reduce((s, a) => s + a.total, 0) || 1;
    const raw = sectors.reduce<{ x: number; rects: { x: number; w: number; sec: SectorAgg }[] }>(
      (acc, sec) => {
        const w = Math.max(20, (sec.total / totalN) * W);
        acc.rects.push({ x: acc.x, w, sec });
        return { x: acc.x + w, rects: acc.rects };
      },
      { x: 0, rects: [] },
    );
    const sc = W / (raw.x || 1);
    return raw.rects.map((r) => ({ x: r.x * sc, w: r.w * sc, sec: r.sec }));
  }, [signals]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700"
      style={{ maxHeight: 170 }}
    >
      {rects.map((r) => {
        const on = !active || active === r.sec.name;
        const clipId = `cs-${r.sec.name.replace(/\W/g, "_")}`;
        return (
          <g
            key={r.sec.name}
            className="cursor-pointer"
            onClick={() => onClick(r.sec.name)}
          >
            <rect
              x={r.x + 1}
              y={1}
              width={Math.max(0, r.w - 2)}
              height={H - 2}
              rx={5}
              fill={heatFill(r.sec.bull, r.sec.bear, r.sec.total)}
              opacity={on ? 0.88 : 0.25}
            />
            <clipPath id={clipId}>
              <rect
                x={r.x + 1}
                y={1}
                width={Math.max(0, r.w - 2)}
                height={H - 2}
              />
            </clipPath>
            <g clipPath={`url(#${clipId})`} opacity={on ? 1 : 0.4}>
              {r.w > 28 && (
                <>
                  <text
                    x={r.x + r.w / 2}
                    y={H / 2 - 18}
                    textAnchor="middle"
                    fill="white"
                    fontSize={r.w > 65 ? 11 : 8}
                    fontWeight={700}
                  >
                    {r.sec.name.length > (r.w > 65 ? 18 : 5)
                      ? r.sec.name.slice(0, r.w > 65 ? 18 : 5) + "…"
                      : r.sec.name}
                  </text>
                  <text
                    x={r.x + r.w / 2}
                    y={H / 2}
                    textAnchor="middle"
                    fill="white"
                    fontSize={10}
                    fontWeight={500}
                    opacity={0.85}
                  >
                    {r.sec.bull}↑ {r.sec.bear}↓
                  </text>
                  {r.w > 48 && (
                    <text
                      x={r.x + r.w / 2}
                      y={H / 2 + 16}
                      textAnchor="middle"
                      fill="white"
                      fontSize={9}
                      opacity={0.6}
                    >
                      {r.sec.total} · avg {r.sec.avgConv}%
                    </text>
                  )}
                </>
              )}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Top Picks ───────────────────────────────────────── */

function PickList({
  title,
  picks,
  color,
  icon,
}: {
  title: string;
  picks: SignalRow[];
  color: "emerald" | "red";
  icon: string;
}) {
  const border =
    color === "emerald"
      ? "border-emerald-200 dark:border-emerald-800"
      : "border-red-200 dark:border-red-800";
  const hdr =
    color === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-red-700 dark:text-red-400";
  const bar =
    color === "emerald"
      ? "bg-emerald-500 dark:bg-emerald-400"
      : "bg-red-500 dark:bg-red-400";

  return (
    <div
      className={`border ${border} rounded-xl overflow-hidden bg-white dark:bg-zinc-900`}
    >
      <div
        className={`px-3 py-2 border-b ${border} bg-zinc-50/60 dark:bg-zinc-800/40`}
      >
        <span
          className={`text-[11px] font-bold uppercase tracking-wider ${hdr}`}
        >
          {icon} {title}
        </span>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {picks.map((s, i) => (
          <div
            key={s.symbol}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition-colors"
          >
            <span className="text-[10px] text-zinc-400 w-3 text-right tabular-nums">
              {i + 1}
            </span>
            <Link
              href={`/stock/${encodeURIComponent(s.symbol)}`}
              className="text-xs font-bold hover:underline w-16 shrink-0 text-zinc-900 dark:text-zinc-100"
            >
              {s.symbol}
            </Link>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate flex-1">
              {s.name}
            </span>
            <span className="text-[10px] text-zinc-400 shrink-0 hidden sm:block max-w-[80px] truncate">
              {s.sector}
            </span>
            <div className="flex items-center gap-1 shrink-0 w-14">
              <span className="text-xs font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
                {Math.round(s.conviction)}
              </span>
              <div className="w-8 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${bar} rounded-full`}
                  style={{ width: `${s.conviction}%` }}
                />
              </div>
            </div>
          </div>
        ))}
        {picks.length === 0 && (
          <div className="px-3 py-3 text-xs text-zinc-400 dark:text-zinc-500 text-center">
            None match current filters
          </div>
        )}
      </div>
    </div>
  );
}

function TopPicks({ signals }: { signals: SignalRow[] }) {
  const best = useMemo(() => {
    const bull = [...signals]
      .filter((s) => s.direction === "bullish")
      .sort((a, b) => b.conviction - a.conviction)
      .slice(0, 6);
    const bear = [...signals]
      .filter((s) => s.direction === "bearish")
      .sort((a, b) => b.conviction - a.conviction)
      .slice(0, 6);
    return { bull, bear };
  }, [signals]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <PickList
        title="Strongest bullish"
        picks={best.bull}
        color="emerald"
        icon="▲"
      />
      <PickList
        title="Strongest bearish"
        picks={best.bear}
        color="red"
        icon="▼"
      />
    </div>
  );
}

/* ── Main Component ──────────────────────────────────── */

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
  const [sector, setSector] = useState("all");
  const [minConviction, setMinConviction] = useState(0);
  const [showFactors, setShowFactors] = useState(false);

  const preSector = useMemo(
    () =>
      signals.filter(
        (s) =>
          (index === "all" || s.index_symbol === index) &&
          (direction === "all" || s.direction === direction) &&
          (status === "all" ||
            (status === "actionable" &&
              !s.gated &&
              !s.event_blackout &&
              s.direction !== "neutral") ||
            (status === "gated" && s.gated) ||
            (status === "blackout" && s.event_blackout)) &&
          s.conviction >= minConviction,
      ),
    [signals, index, direction, status, minConviction],
  );

  const filtered = useMemo(
    () =>
      sector === "all"
        ? preSector
        : preSector.filter((s) => s.sector === sector),
    [preSector, sector],
  );

  const handleSector = (name: string) =>
    setSector((p) => (p === name ? "all" : name));

  const sel =
    "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs shadow-sm focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 focus:outline-none text-zinc-800 dark:text-zinc-200";

  return (
    <div className="space-y-4">
      <SummaryStrip signals={filtered} />

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Sector signal map
          </h2>
          {sector !== "all" && (
            <button
              onClick={() => setSector("all")}
              className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline"
            >
              Clear: {sector}
            </button>
          )}
        </div>
        <SectorMap
          signals={preSector}
          active={sector}
          onClick={handleSector}
        />
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1">
          Click a sector to filter · green = majority bullish · red = majority
          bearish · block size = number of stocks
        </p>
      </div>

      <TopPicks signals={filtered} />

      {/* Filters */}
      <div className="flex gap-2.5 items-center text-xs flex-wrap">
        <select
          className={sel}
          value={index}
          onChange={(e) => setIndex(e.target.value)}
        >
          <option value="all">All indices</option>
          <option>SPX</option>
          <option>NDX</option>
          <option>UKX</option>
        </select>
        <select
          className={sel}
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
        >
          <option value="all">All directions</option>
          <option>bullish</option>
          <option>bearish</option>
          <option>neutral</option>
        </select>
        <select
          className={sel}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="actionable">Actionable</option>
          <option value="gated">Gated</option>
          <option value="blackout">Event blackout</option>
        </select>
        <label className="text-zinc-600 dark:text-zinc-400">
          Min conviction{" "}
          <input
            type="number"
            min={0}
            max={100}
            value={minConviction}
            onChange={(e) => setMinConviction(Number(e.target.value))}
            className={`${sel} w-16`}
          />
        </label>
        <label className="text-zinc-600 dark:text-zinc-400 flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={showFactors}
            onChange={(e) => setShowFactors(e.target.checked)}
          />
          factor detail
        </label>
        <span className="text-zinc-500 dark:text-zinc-400 ml-auto tabular-nums">
          {filtered.length} rows
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-sm bg-white dark:bg-zinc-900">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="text-zinc-500 dark:text-zinc-400 text-left bg-zinc-50/80 dark:bg-zinc-800/60 sticky top-0">
            <tr>
              <th className="px-1.5 py-2.5 w-6" />
              <th className="px-2 py-2.5 font-semibold">Symbol</th>
              <th className="px-2 py-2.5 font-semibold">Company</th>
              <th className="px-2 py-2.5 font-semibold">Index</th>
              <th className="px-2 py-2.5 font-semibold">Sector</th>
              <th className="px-2 py-2.5 font-semibold">Signal</th>
              <th className="px-2 py-2.5 font-semibold">Conviction</th>
              {showFactors &&
                FACTORS.map((f) => (
                  <th key={f} className="px-1.5 py-2.5 font-semibold">
                    {f === "relativeStrength" ? "RS" : f}
                  </th>
                ))}
              <th className="px-2 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.slice(0, 400).map((s) => (
              <tr
                key={s.symbol}
                className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition-colors"
              >
                <td className="px-1.5 py-1.5">
                  <WatchStar
                    symbol={s.symbol}
                    inList={watched.has(s.symbol)}
                  />
                </td>
                <td className="px-2 py-1.5 font-bold text-zinc-900 dark:text-zinc-100">
                  <Link
                    href={`/stock/${encodeURIComponent(s.symbol)}`}
                    className="hover:underline"
                  >
                    {s.symbol}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-zinc-500 dark:text-zinc-400 max-w-[180px] truncate">
                  {s.name ?? "–"}
                </td>
                <td className="px-2 text-zinc-600 dark:text-zinc-400">
                  {s.index_symbol}
                </td>
                <td className="px-2 text-zinc-500 dark:text-zinc-400 max-w-[140px] truncate">
                  {s.sector}
                </td>
                <td className="px-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      s.direction === "bullish"
                        ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                        : s.direction === "bearish"
                          ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {s.direction}
                  </span>
                </td>
                <td className="px-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold tabular-nums text-zinc-800 dark:text-zinc-200 w-6 text-right">
                      {Math.round(s.conviction)}
                    </span>
                    <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${convBarCls(s.conviction)}`}
                        style={{ width: `${s.conviction}%` }}
                      />
                    </div>
                  </div>
                </td>
                {showFactors &&
                  FACTORS.map((f) => {
                    const v = s.factors?.[f];
                    return (
                      <td key={f} className="px-1.5">
                        {v == null ? (
                          <span className="text-zinc-300 dark:text-zinc-600">
                            –
                          </span>
                        ) : (
                          <span
                            className={`inline-block px-1 rounded text-[10px] tabular-nums font-medium ${
                              v > 0.3
                                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                : v < -0.3
                                  ? "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                  : "text-zinc-500 dark:text-zinc-400"
                            }`}
                          >
                            {v > 0 ? "+" : ""}
                            {v.toFixed(2)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                <td className="px-2">
                  {s.gated && (
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
                      title={s.gate_reason ?? ""}
                    >
                      GATED
                    </span>
                  )}
                  {s.event_blackout && (
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400 ml-0.5"
                      title={s.upcoming_events
                        .map((e) => e.event_name)
                        .join(", ")}
                    >
                      BLACKOUT
                    </span>
                  )}
                  {!s.gated &&
                    !s.event_blackout &&
                    s.direction !== "neutral" && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                        ✓ CLEAR
                      </span>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 400 && (
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
          Showing 400 of {filtered.length} rows. Use filters to narrow results.
        </p>
      )}
      <p className="text-[9px] text-zinc-400 dark:text-zinc-500">
        Gated = regime blocks entry. Blackout = earnings or high-impact release
        within 5 days. Factor cells in [-1, +1].
      </p>
    </div>
  );
}
