import type { TopConstituent } from "../lib/data/queries";

interface SectorBlock {
  sector: string;
  cap: number;
  bullish: number;
  bearish: number;
  total: number;
}

function aggregateSectors(stocks: TopConstituent[]): SectorBlock[] {
  const map = new Map<string, SectorBlock>();
  for (const s of stocks) {
    const sec = s.sector ?? "Other";
    const b = map.get(sec) ?? { sector: sec, cap: 0, bullish: 0, bearish: 0, total: 0 };
    b.cap += s.market_cap ?? 0;
    b.total++;
    if (s.direction === "bullish") b.bullish++;
    else if (s.direction === "bearish") b.bearish++;
    map.set(sec, b);
  }
  return Array.from(map.values()).sort((a, b) => b.cap - a.cap);
}

function sectorColor(b: SectorBlock): string {
  const ratio = b.total > 0 ? (b.bullish - b.bearish) / b.total : 0;
  if (ratio > 0.3) return "#059669";
  if (ratio > 0) return "#34d399";
  if (ratio < -0.3) return "#dc2626";
  if (ratio < 0) return "#f87171";
  return "#a1a1aa";
}

function sectorColorDark(b: SectorBlock): string {
  const ratio = b.total > 0 ? (b.bullish - b.bearish) / b.total : 0;
  if (ratio > 0.3) return "#10b981";
  if (ratio > 0) return "#065f46";
  if (ratio < -0.3) return "#ef4444";
  if (ratio < 0) return "#7f1d1d";
  return "#52525b";
}

export function SectorHeatmap({ stocks }: { stocks: TopConstituent[] }) {
  const sectors = aggregateSectors(stocks);
  if (sectors.length === 0) return null;

  const totalCap = sectors.reduce((s, b) => s + b.cap, 0) || 1;
  const W = 400, H = 120;
  const rects: Array<{ x: number; y: number; w: number; h: number; block: SectorBlock }> = [];

  let x = 0;
  for (const block of sectors) {
    const w = Math.max(20, (block.cap / totalCap) * W);
    rects.push({ x, y: 0, w, h: H, block });
    x += w;
  }
  const scale = W / x;
  for (const r of rects) {
    r.x *= scale;
    r.w *= scale;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto", maxHeight: 120 }}>
        {rects.map((r) => (
          <g key={r.block.sector}>
            <rect
              x={r.x + 1} y={1} width={Math.max(0, r.w - 2)} height={H - 2} rx={4}
              className="fill-current"
              style={{ color: `var(--sector-${r.block.sector.replace(/\s+/g, "-").toLowerCase()}, ${sectorColor(r.block)})` }}
              fill={sectorColor(r.block)}
              opacity={0.85}
            />
            <clipPath id={`clip-${r.block.sector.replace(/\s+/g, "-")}`}>
              <rect x={r.x + 1} y={1} width={Math.max(0, r.w - 2)} height={H - 2} />
            </clipPath>
            <g clipPath={`url(#clip-${r.block.sector.replace(/\s+/g, "-")})`}>
              {r.w > 30 && (
                <>
                  <text x={r.x + r.w / 2} y={H / 2 - 8} textAnchor="middle" fill="white" fontSize={r.w > 60 ? 11 : 9} fontWeight={600} opacity={0.95}>
                    {r.block.sector.length > (r.w > 60 ? 16 : 6) ? r.block.sector.slice(0, r.w > 60 ? 16 : 6) + "…" : r.block.sector}
                  </text>
                  <text x={r.x + r.w / 2} y={H / 2 + 8} textAnchor="middle" fill="white" fontSize={9} opacity={0.7}>
                    {r.block.bullish}B {r.block.bearish}R / {r.block.total}
                  </text>
                  {r.w > 50 && (
                    <text x={r.x + r.w / 2} y={H / 2 + 22} textAnchor="middle" fill="white" fontSize={8} opacity={0.5}>
                      {(r.block.cap / 1e12).toFixed(1)}T
                    </text>
                  )}
                </>
              )}
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
