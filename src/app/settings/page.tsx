import { REGIME_WEIGHTS, GAUGE_WEIGHTS, SIGNAL_WEIGHTS, WEIGHTS_VERSION } from "../../config/weights";
import { PROVIDER_PRIORITY, RATE_LIMITS, CACHE_TTL_SECONDS } from "../../config/providers";
import { INDICATOR_PARAMS } from "../../config/indicators";
import { Panel } from "../../components/ui";

export default function SettingsPage() {
  const blocks: Array<[string, unknown]> = [
    [`Weights (version ${WEIGHTS_VERSION})`, { regime: REGIME_WEIGHTS, gauge: GAUGE_WEIGHTS, signals: SIGNAL_WEIGHTS }],
    ["Indicator parameters", INDICATOR_PARAMS],
    ["Provider priority & rate limits", { priority: PROVIDER_PRIORITY, rateLimits: RATE_LIMITS, cacheTtlSeconds: CACHE_TTL_SECONDS }],
    ["Schedules", {
      "ingestion (daily)": "Mon–Fri 22:30 UTC — OHLCV, macro, calendar, earnings, positioning, technicals, breadth, regime, signals, quality",
      "ingestion (weekend)": "Sat 07:00 UTC — membership sync + full pass",
      sentiment: "Mon–Fri 11:00 & 21:45 UTC — headlines, GDELT, social, FinBERT, aggregates",
    }],
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">
        Settings <span className="text-xs font-normal text-zinc-500">read-only view — single-user; changes are code/config commits so every value is versioned</span>
      </h1>
      {blocks.map(([title, value]) => (
        <Panel key={title as string} title={title as string}>
          <pre className="text-[11px] text-zinc-700 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(value, null, 2)}
          </pre>
        </Panel>
      ))}
      <Panel title="Secrets & data sources">
        <p className="text-xs text-zinc-600">
          API keys live in .env.local / GitHub Actions secrets / Netlify env vars only. Free sources:
          Yahoo (OHLCV, caps, earnings), Wikipedia + Nasdaq API (membership), FRED (macro, vintaged),
          ForexFactory (calendar), CFTC (COT), RSS + GDELT + StockTwits (narrative). Every datapoint row
          stores source, as_of, ingested_at.
        </p>
      </Panel>
    </div>
  );
}
