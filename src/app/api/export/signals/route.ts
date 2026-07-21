import { getSignals } from "../../../../lib/data/queries";

/** CSV export of the latest ranked signal list. */
export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(): Promise<Response> {
  const signals = await getSignals();
  const factorKeys = ["trendMa", "momentum", "divergence", "relativeStrength", "volume", "bollinger", "range"];
  const header = [
    "symbol", "name", "index", "sector", "week", "direction", "conviction",
    "composite", ...factorKeys, "gated", "gate_reason", "event_blackout",
  ];
  const lines = [header.join(",")];
  for (const s of signals) {
    lines.push(
      [
        s.symbol, s.name, s.index_symbol, s.sector, s.as_of_date, s.direction,
        Math.round(s.conviction), s.composite_score,
        ...factorKeys.map((k) => s.factors?.[k]?.toFixed(3) ?? ""),
        s.gated, s.gate_reason ?? "", s.event_blackout,
      ].map(csvCell).join(","),
    );
  }
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="signals-${signals[0]?.as_of_date ?? "latest"}.csv"`,
    },
  });
}
