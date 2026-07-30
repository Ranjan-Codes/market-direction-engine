# TODO

Open items and future improvements for the Market Direction Engine.

## High priority

- [x] **DB space reclaim** — Deleted 489K old rows + VACUUM FULL reclaimed 339 MB (525 → 186 MB). Retention tightened: daily bars 400 days, snapshots 52 weeks.
- [ ] **Mobile responsive testing** — Side-by-side layout falls back to single column at <1280px but the compact table may still need horizontal scroll on small screens. Test and polish.

## Medium priority

- [ ] **Expand to more indices** — Architecture supports adding indices (e.g. DAX, Nikkei 225) by adding to `index_membership` + ingestion config. Evaluate data source coverage first.
- [x] **IG client sentiment** — Watchlist cards show IG trader sentiment (% long vs short) as a contrarian indicator. Session-cached, parallel fetching, graceful fallback.
- [ ] **Intraday price refresh** — Currently showing previous day's close. Could add a lightweight intraday quote fetch (Yahoo delayed) for live-ish prices during market hours.
- [ ] **Alert delivery** — Threshold alerts exist but delivery is GitHub Issues only. Consider email/Slack/push notification channels.
- [ ] **Backtest chart visualizations** — Backtest page shows tables; adding equity curve charts and drawdown visualizations would improve interpretability.
- [x] **Dark mode** — Implemented with class-based Tailwind v4 toggle, localStorage persistence, flash-prevention script.

## Low priority / nice-to-have

- [ ] **Export to CSV/Excel** — Report page supports PDF via print. Add direct CSV/Excel export for the screener and Top 20 tables.
- [x] **Sector heatmap** — SVG treemap on landing page, sized by market cap, colored by signal direction.
- [x] **Screener visual redesign** — Summary cards, distribution bar, sector signal map (clickable filter), top picks panels, colored table badges, full dark mode.
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
