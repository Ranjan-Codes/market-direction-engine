/** Shared dense-UI primitives: sparkline, gauge dial, badges, panel. */

export function Sparkline({
  values,
  width = 120,
  height = 28,
  baseline,
}: {
  values: number[];
    width?: number;
  height?: number;
  baseline?: number;
}) {
  if (values.length < 2) return <span className="text-zinc-500 text-xs">–</span>;
  const min = Math.min(...values, baseline ?? Infinity);
  const max = Math.max(...values, baseline ?? -Infinity);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(" ");
  const baseY = baseline != null ? height - ((baseline - min) / span) * height : null;
  return (
    <svg width={width} height={height} className="inline-block align-middle">
      {baseY != null && (
        <line x1={0} y1={baseY} x2={width} y2={baseY} stroke="#71717a" strokeDasharray="2,3" strokeWidth={1} />
      )}
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

export function GaugeDial({ direction, intensity }: { direction: string; intensity: number }) {
  const overbought = direction === "overbought-reversal-risk";
  const oversold = direction === "oversold-rebound-setup";
  const color = overbought ? "#dc2626" : oversold ? "#16a34a" : "#71717a";
  // Half-donut: needle sweeps 180° with intensity.
  const angle = Math.PI * (1 - intensity / 100);
  const cx = 60, cy = 55, r = 46;
  const nx = cx + r * 0.82 * Math.cos(angle);
  const ny = cy - r * 0.82 * Math.sin(angle);
  return (
    <svg width={120} height={66}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#d4d4d8" strokeWidth={9} />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(angle)} ${cy - r * Math.sin(angle)}`}
        fill="none" stroke={color} strokeWidth={9} strokeLinecap="round"
      />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#52525b" strokeWidth={2} />
      <text x={cx} y={cy - 12} textAnchor="middle" className="fill-current" fontSize={20} fontWeight={700}>
        {intensity}
      </text>
    </svg>
  );
}

export function RegimeBadge({ regime }: { regime: string }) {
  const cls =
    regime === "risk_on"
      ? "bg-green-100 text-green-800 border-green-300"
      : regime === "risk_off"
        ? "bg-red-100 text-red-800 border-red-300"
        : "bg-zinc-200 text-zinc-700 border-zinc-400";
  return (
    <span className={`px-2 py-0.5 rounded border text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {regime.replace("_", "-")}
    </span>
  );
}

export function Tag({ kind }: { kind: "leading" | "coincident" | "lagging" }) {
  const cls =
    kind === "leading"
      ? "text-amber-700 border-amber-400"
      : kind === "coincident"
        ? "text-sky-700 border-sky-300"
        : "text-zinc-600 border-zinc-400";
  return <span className={`px-1 py-px border rounded text-[10px] uppercase ${cls}`}>{kind}</span>;
}

export function Panel({
  title,
  asOf,
  tag,
  help,
  children,
}: {
  title: string;
  asOf?: string | Date | null;
  tag?: "leading" | "coincident" | "lagging";
  /** Collapsible "how to read this" note shown under the panel header. */
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  const asOfText =
    asOf instanceof Date ? asOf.toISOString().slice(0, 10) : asOf ? String(asOf).slice(0, 10) : null;
  return (
    <section className="border border-zinc-200 rounded-xl bg-white shadow-sm">
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-100">
        <h2 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
          {title} {tag && <Tag kind={tag} />}
        </h2>
        {asOfText && <span className="text-[10px] text-zinc-500">as of {asOfText}</span>}
      </header>
      {help && <HelpNote>{help}</HelpNote>}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Collapsible explanation block — dense by default, expands on click. */
export function HelpNote({ children }: { children: React.ReactNode }) {
  return (
    <details className="border-b border-zinc-100 px-4 py-1.5 group">
      <summary className="text-[11px] text-zinc-500 cursor-pointer select-none hover:text-zinc-700 list-none">
        <span className="group-open:hidden">ⓘ how to read this</span>
        <span className="hidden group-open:inline">ⓘ hide</span>
      </summary>
      <div className="text-[11px] text-zinc-600 leading-relaxed py-1.5 max-w-3xl">{children}</div>
    </details>
  );
}

export const fmtPct = (v: number | string | null | undefined, digits = 1) => { const n = v == null ? null : Number(v); return n == null || Number.isNaN(n) ? "—" : `${(n * 100).toFixed(digits)}%`; };
export const fmtNum = (v: number | string | null | undefined, digits = 1) => { const n = v == null ? null : Number(v); return n == null || Number.isNaN(n) ? "—" : n.toFixed(digits); };
