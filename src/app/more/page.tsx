import Link from "next/link";

/** Index of the deeper/less-frequent screens, with one-line descriptions. */
export default function MorePage() {
  const items: Array<[string, string, string]> = [
    ["/narrative", "Narrative & sentiment", "News tone, theme tones, retail gauges, scored headlines"],
    ["/backtest", "Backtest & validation", "How often the signals and warnings have actually worked"],
    ["/report", "Printable report", "Regime + watchlist snapshot — save as PDF"],
    ["/guide", "Guide", "How to read everything in this app"],
    ["/settings", "Settings", "Weights, parameters, data sources, schedules (read-only)"],
  ];
  return (
    <div className="max-w-2xl mx-auto py-6 space-y-4">
      <h1 className="text-xl font-bold tracking-tight mb-4">More</h1>
      {items.map(([href, title, desc]) => (
        <Link
          key={href}
          href={href}
          className="block border border-zinc-200 rounded-xl p-4 bg-white shadow-sm hover:bg-zinc-50 hover:shadow transition-all"
        >
          <p className="font-semibold text-zinc-900">{title}</p>
          <p className="text-sm text-zinc-500">{desc}</p>
        </Link>
      ))}
    </div>
  );
}
