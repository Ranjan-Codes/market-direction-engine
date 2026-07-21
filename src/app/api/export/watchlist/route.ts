import { getWatchlist } from "../../../../lib/data/watchlist";

/** CSV export of the watchlist with leading-indicator verdicts. */
export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(): Promise<Response> {
  const entries = await getWatchlist();
  const header = [
    "symbol", "name", "index", "sector", "week", "verdict", "headline",
    "evidence", "signal", "conviction", "gated", "rsi_14", "mansfield_rs", "pos_52w_range",
  ];
  const lines = [header.join(",")];
  for (const e of entries) {
    lines.push(
      [
        e.symbol, e.name, e.index_symbol, e.sector, e.week_end,
        e.suggestion.verdict, e.suggestion.headline,
        e.suggestion.evidence.join(" | "),
        e.direction, e.conviction != null ? Math.round(e.conviction) : "",
        e.gated, e.rsi_14?.toFixed(1), e.mansfield_rs?.toFixed(1),
        e.pos_52w_range != null ? (e.pos_52w_range * 100).toFixed(0) + "%" : "",
      ].map(csvCell).join(","),
    );
  }
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="watchlist-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
