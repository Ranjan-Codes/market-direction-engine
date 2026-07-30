# Changelog

All notable changes to the Market Direction Engine.

## 2026-07-30

### Changed — Compact watchlist layout
- **3-column grid** on wide screens (was 2-column), 2-column on medium, 1-column on mobile
- **Cards ~50% shorter** — verdict condensed to single line (evidence bullets removed), factor bars replaced with compact color-coded chips (top 4), stat gauges replaced with inline text, fundamentals inlined to one row
- **Summary bar** — verdict counts now display as inline badges instead of tall boxes
- Container widened to 1600px to accommodate 3 columns
- Tighter padding and smaller font sizes throughout

### Added — Watchlist fundamentals & tooltips
- **Yahoo Finance fundamentals** on every watchlist card — dividend yield, P/E (trailing + forward), EPS (TTM + forward), price-to-book, analyst price target and recommendation badge
- **Hover tooltips** on all technical jargon — every label (bullish, RSI, P/E, gated, etc.) now shows a plain-English explanation on hover
- Renamed "conv" to "confidence" and "blackout" to "earnings soon" for clarity

### Fixed — CI & database
- **CI lint errors fixed** — theme toggle rewritten with `useSyncExternalStore` (was `useState` in `useEffect`), `let` → `const` in top-table, removed unused imports
- **Pre-push hook** — `npm run verify` (lint + typecheck + tests) runs automatically before every push; broken code can no longer reach GitHub
- **Database space reclaim** — reduced daily bar retention from 3 years to 400 days, snapshot retention from 3 years to 52 weeks, deleted ~489K old rows, VACUUM FULL reclaimed ~339 MB (525 → 186 MB)

### Added — Dashboard visual overhaul
- **Dark mode** — class-based toggle with localStorage persistence and flash-prevention; theme-aware CSS variables across all landing page components
- **Mini sparklines** — 5-day price trend per stock in Top 20 table (new `spark` CTE in query)
- **Visual gauges** — Market Pulse metrics now show colored progress bars instead of plain numbers (VIX, breadth, overbought/oversold)
- **Signal change badges** — FLIP badge when a stock's signal changed in the last 7 days (new `prev_signal` CTE)
- **Interactive Top 20 table** — client component with sortable columns (click headers), signal direction filter dropdown
- **Collapsible sections** — Market Pulse, Technical Indicators, Sector Heatmap can be collapsed/expanded
- **Sector heatmap** — SVG treemap sized by market cap, colored by bullish/bearish ratio per sector

### Added — Earlier on 2026-07-30
- **Side-by-side index layout** — S&P 500 and FTSE 100 displayed in a 2-column grid at desktop width, single column on mobile
- **Signal driver column** — Top 20 table shows the strongest factor behind each stock's signal (Trend, Momentum, Rel Str, Divergence, Volume, Bollinger, Range), color-coded green/red
- Fetch `sub_scores` factor breakdown from signals table in `getTopConstituents` query
- README.md, CHANGELOG.md, TODO.md project documentation

### Changed
- Landing page container widened to `max-w-[1600px]` for side-by-side layout
- Market Pulse compact 3-column grid (was 5-column)
- Technical Indicators compact 2-column grid per card (was 4-column)
- Top 20 table: tighter padding, smaller font, removed Conv and RS columns for space
- Indicator tiles: removed verbose tip text, inlined confidence % in header
- Pulse metrics: removed tip descriptions for compactness
- Weekly insights and watchlist alerts also use 2-column grid

## 2026-07-29

### Added
- **Top 20 constituents by market cap** per index on landing page with 11-column institutional-grade table (#, Ticker, Company, Mkt Cap, Price, Chg%, Signal, Conv, RSI, 52w Range bar, RS)
- `getTopConstituents(limit)` query using CTE with `row_number()` partitioned by index
- Market cap formatting helper (`fmtCap`) — $T, $B, $M
- **Daily price change** for each index on landing page using `lag()` window function over `ohlcv_daily`
- `getIndexDailyPrices()` query returning close, previous close, change, change_pct per index
- **Index closing prices** shown in card headers

### Changed
- Removed Nasdaq 100 from landing page (only S&P 500 and FTSE 100)

### Added (visual polish)
- **Company name column** added to screener table
- Visual upgrade across all pages: `border-zinc-300` -> `border-zinc-200`, `rounded` -> `rounded-xl`, `shadow-sm`
- Shared Panel component upgraded (border, padding, header styles)
- Nav and footer updated to match new design system
- All page titles: `text-lg` -> `text-xl tracking-tight`

### Added (landing page redesign)
- **Market Pulse section** — Fear & Greed meter, VIX with percentile, overbought/oversold breadth, % above 200d MA
- **Technical Indicators grid** with confidence bars, signal coloring, and explanation tips per indicator
- `interpretIndicators()` and `marketVerdict()` functions for plain-English readings
- Weekly insights auto-generated from regime data
- Catalyst schedule in card footers
- 12-month regime sparkline per index

## 2026-07-28

### Added
- Netlify deployment config + Next.js plugin
- Auto-deploy from `main` branch

### Changed
- Slim DB storage: dropped write-only columns, tightened retention (493 -> ~325 MB)

## Earlier (phases 0-7)

### Phase 7 — Alerts & exports
- Threshold alerts and export functionality
- In-app reading guidance with per-panel help notes
- Methodology guide page

### Phase 6 — UI
- Seven core screens: Today, Screener, Watchlist, Calendar, Narrative, Backtest, Report
- Settings page (read-only weights/params view)
- Stock detail pages with chart overlays (daily/weekly/monthly timeframes)
- Market detail pages per index
- Universal watchlist: search and add any listed stock from any exchange
- Plain-English layer with auto-generated weekly insights
- Light theme redesign

### Phase 5 — Validation
- Point-in-time backtest harness with walk-forward replay

### Phase 4 — Signal synthesis
- Per-stock composite signal from 7 weighted factors
- Regime gate ("don't fight the tape")
- Event blackout (5 days before high-importance releases)

### Phase 3b — Regime engine
- Breadth analysis, regime scoring (0-100 composite)
- Reversal-risk gauge with overbought/oversold evidence items

### Phase 3 — Sentiment engine
- RSS, GDELT, social media, FinBERT scoring
- Sentiment aggregation and trend detection

### Phase 2 — Technical engine
- Weekly indicators: RSI, MACD, Bollinger, ADX, volume, Mansfield RS
- Divergence detection, MA cross detection
- Technical snapshots per instrument per week

### Phase 1 — Ingestion
- OHLCV from Yahoo Finance (daily + weekly)
- Index membership from Wikipedia + Nasdaq API
- Macro from FRED (vintaged observations)
- Calendar from ForexFactory
- COT positioning from CFTC
- Earnings catalysts (top-25 by cap per index)

### Phase 0 — Scaffold
- Repository setup with Next.js App Router
- Supabase Postgres schema with 20+ tables
- Provider abstraction layer
- Environment validation with Zod
- CI pipeline with GitHub Actions
