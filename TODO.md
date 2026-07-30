# TODO

Open items and future improvements for the Market Direction Engine.

## High priority

- [ ] **Run DB space reclaim SQL** — Three SQL blocks pending execution in Supabase SQL Editor to physically reclaim ~160 MB (VACUUM FULL on ohlcv_daily, ohlcv_weekly, technical_snapshots). The logical trim is done; physical rewrite needs a maintenance window.
- [ ] **Mobile responsive testing** — Side-by-side layout falls back to single column at <1280px but the compact table may still need horizontal scroll on small screens. Test and polish.

## Medium priority

- [ ] **Expand to more indices** — Architecture supports adding indices (e.g. DAX, Nikkei 225) by adding to `index_membership` + ingestion config. Evaluate data source coverage first.
- [ ] **Intraday price refresh** — Currently showing previous day's close. Could add a lightweight intraday quote fetch (Yahoo delayed) for live-ish prices during market hours.
- [ ] **Alert delivery** — Threshold alerts exist but delivery is GitHub Issues only. Consider email/Slack/push notification channels.
- [ ] **Backtest chart visualizations** — Backtest page shows tables; adding equity curve charts and drawdown visualizations would improve interpretability.
- [ ] **Dark mode** — Currently light theme only. Tailwind dark mode classes are straightforward to add.

## Low priority / nice-to-have

- [ ] **Export to CSV/Excel** — Report page supports PDF via print. Add direct CSV/Excel export for the screener and Top 20 tables.
- [ ] **Sector heatmap** — Visual heatmap of sector-level signal strength across the index.
- [ ] **Correlation matrix** — Show cross-stock and cross-factor correlations for portfolio context.
- [ ] **Multi-user support** — Currently single-user (watchlist stored in DB without user scoping). Add auth if needed for shared use.
- [ ] **Historical signal accuracy tracking** — Track forward returns of signals over time to show live hit-rate dashboards.

## Data quality

- [ ] **Survivorship bias caveat** — Membership history before mid-2026 uses current members. Document this more prominently and consider sourcing historical membership lists.
- [ ] **Narrative data depth** — Sentiment history is young (<6 months). More historical data needed before sentiment signals carry full weight in backtests.
- [ ] **GDELT rate limiting** — Occasional per-query throttling. Current workaround paces at 20s intervals; consider caching layer.

## Technical debt

- [ ] **Turbopack stale cache on Windows** — Known issue where Turbopack caches compilation errors from previous file states. Workaround: delete `.next` and restart dev server. Does not affect production builds.
- [ ] **Type safety for JSONB columns** — `breakdown`, `sub_scores`, `metadata` are typed as `Record<string, unknown>`. Consider generating types from the actual JSON shapes.
