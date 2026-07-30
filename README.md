# Market Direction Engine

Symmetric overbought/oversold early-warning gauge per index, corroborated by macro releases and top-25 earnings. Built for a 2-6 week investment horizon.

**Live:** https://market-direction-engine.netlify.app

> **Disclaimer:** analytical decision-support only. Not investment advice, not
> automated trading, no order execution. All outputs are probabilistic and may
> be wrong. Verify independently before acting.

## What it does

Watches for markets that are **stretched** (overbought or oversold) and warns, with evidence and a catalyst schedule, when a reversal is likely within the next 2-6 weeks. Everything else exists to support, corroborate, or act on that warning.

## Indices covered

- **S&P 500** (SPX) - ~503 constituents
- **FTSE 100** (UKX) - 100 constituents

Full constituent depth, point-in-time membership. Weekly bars primary; daily bars for freshness and breadth.

## Architecture

```
GitHub Actions (scheduled, all heavy work)          Netlify (thin read layer)
+------------------------------------------+       +------------------------+
| ingestion -> adjustment -> indicators -> | writes | Next.js 16 App Router  |
| sentiment scoring (FinBERT) -> regime -> |------->| reads precomputed      |
| signals -> backtests                     |       | Supabase tables        |
+------------------------------------------+       +------------------------+
                     |
             Supabase Postgres (RLS deny-by-default)
```

- **Next.js 16** App Router with server components (`force-dynamic`)
- **Supabase Postgres** accessed via `pg` Pool through `getPool()`
- **Tailwind CSS** for styling (zinc palette, rounded-xl shadow-sm design system)
- **Netlify SSR** auto-deployed from `main` branch
- **GitHub Actions** for ingestion pipelines (daily Mon-Fri + weekend)
- **Free data sources only** behind a provider abstraction — app code never calls a vendor directly

Every stored datapoint carries `source`, `as_of`, and `ingested_at`. Look-ahead prevention everywhere: vintaged macro observations, point-in-time index membership, strict as-of selection in backtests.

## The four layers

1. **Market regime (the gate)** - Per index, five evidence families (trend 25%, breadth 30%, intermarket 20%, positioning 10%, narrative 15%) blend into a 0-100 composite. The reversal-risk gauge fires when stretch evidence accumulates.
2. **Weekly technicals per stock** - RSI, MACD, Bollinger, ADX, volume, relative strength, 52-week range on weekly bars because the horizon is weeks, not days.
3. **Signals** - Technicals blend into per-stock direction + conviction via 7 weighted factors. Regime gate suppresses bullish setups in hostile markets. Event blackout prevents entries within 5 days of big releases.
4. **Validation** - Same code replayed over history shows honest hit rates (~mid-50s% at best; the edge comes from expectancy and avoiding hostile regimes).

## Signal factors (7 weighted inputs)

| Factor | Weight | Source |
|---|---|---|
| Trend/MA | 22% | Price vs 30w/40w MAs, slopes, golden/death crosses |
| Momentum | 20% | MACD histogram + RSI (dampened in low-ADX/choppy markets) |
| Relative Strength | 18% | Mansfield RS vs own index |
| Divergence | 12% | Weekly RSI divergence vs price (leading reversal warning) |
| Volume | 12% | Volume confirmation + 20-week ratio |
| Bollinger | 8% | Band walk, %B extremes, squeeze setups |
| Range | 8% | 52-week range (contrarian-dampened at extremes) |

## Pages

| Page | Purpose |
|---|---|
| **Today** (landing) | Side-by-side S&P 500 / FTSE 100 with Market Pulse, technical indicators, Top 20 by market cap with signal drivers |
| **Watchlist** | Personal watchlist with search-and-add (any exchange), leading-indicator verdicts |
| **Stocks** (screener) | All index members with direction, conviction, per-factor decomposition |
| **Calendar** | Upcoming macro releases + earnings with importance ratings |
| **Narrative** | Sentiment from RSS, GDELT, social, FinBERT |
| **Backtest** | Point-in-time validation of signal performance |
| **Report** | Print-optimized PDF snapshot |
| **Guide** | Methodology in plain English |
| **Settings** | Read-only view of weights, indicator params, schedules |

## Data sources (all free)

Yahoo (OHLCV, market caps, earnings), Wikipedia + Nasdaq API (index membership), FRED (macro, vintaged), ForexFactory (calendar), CFTC (COT positioning), RSS + GDELT + StockTwits (narrative/sentiment).

## Repository layout

```
supabase/migrations/   SQL schema
src/config/            weights, universe, provider limits, indicator params
src/lib/providers/     provider interfaces + registry
src/lib/compute/       technicals, signals, regime engine
src/lib/indicators/    RSI, MACD, Bollinger, ADX, volume, Mansfield RS, etc.
src/lib/data/          query layer (queries.ts, watchlist.ts)
src/app/               Next.js pages (App Router)
src/components/        shared UI components
scripts/               ingestion + maintenance scripts
.github/workflows/     CI + scheduled ingestion/compute jobs
```

## Setup

1. `npm install`
2. Copy `.env.example` -> `.env.local`, fill in Supabase + provider keys.
   **Secrets never go in code or commits** — only `.env.local`, GitHub Actions secrets, and Netlify env vars.
3. Apply `supabase/migrations/` to the Supabase project.
4. `npm run dev` -> http://localhost:3000

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | local dev server (Turbopack) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest unit tests |

## Build phases (all complete)

- [x] **Phase 0** — scaffold: repo, schema, env handling, provider abstraction, CI
- [x] **Phase 1** — ingestion: OHLCV, constituents, macro, calendar, positioning
- [x] **Phase 2** — technical engine (Layer 2 weekly indicators + snapshots)
- [x] **Phase 3** — narrative/sentiment engine (RSS, GDELT, social, FinBERT)
- [x] **Phase 3b** — regime engine (breadth, regime score, reversal-risk gauge)
- [x] **Phase 4** — signal synthesis + regime gate + event blackout
- [x] **Phase 5** — validation: point-in-time backtest harness
- [x] **Phase 6** — UI (10 screens + stock/market detail pages)
- [x] **Phase 7** — alerts, exports, watchlist with leading-indicator verdicts

## Ingestion schedules

| Schedule | Timing | What runs |
|---|---|---|
| Daily | Mon-Fri 22:30 UTC | OHLCV, macro, calendar, earnings, positioning, technicals, breadth, regime, signals, quality |
| Weekend | Sat 07:00 UTC | Membership sync + full recompute pass |
| Sentiment | Mon-Fri 11:00 & 21:45 UTC | Headlines, GDELT, social, FinBERT, aggregates |
