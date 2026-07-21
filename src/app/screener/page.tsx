import { getSignals } from "../../lib/data/queries";
import { getWatchlistSymbols } from "../../lib/data/watchlist";
import { ScreenerTable } from "./table";

export const dynamic = "force-dynamic";

export default async function ScreenerPage() {
  const [signals, watchSymbols] = await Promise.all([getSignals(), getWatchlistSymbols()]);
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">
        Signal screener{" "}
        <span className="text-xs font-normal text-zinc-500">
          week ending {signals[0]?.as_of_date} · {signals.length} constituents · 2–6 week horizon
        </span>
      </h1>
      <ScreenerTable signals={signals} watchSymbols={[...watchSymbols]} />
    </div>
  );
}
