# Market Direction Engine

Institutional-grade **market direction and technical signal decision-support tool**
for a 2–6 week horizon. Combines a top-down macro/regime layer with bottom-up
weekly technicals on index constituents; constituent signals are only promoted
to actionable when the market regime permits them ("don't fight the tape").

> **Disclaimer:** analytical decision-support only. Not investment advice, not
> automated trading, no order execution. All outputs are probabilistic.

## v1 universe

S&P 500, Nasdaq 100, NYSE Composite (US) and FTSE 100 (UK) — full constituent
depth, point-in-time membership where sources allow. Weekly bars primary;
daily bars for freshness and breadth.

## Architecture

```
GitHub Actions (scheduled, all heavy work)          Netlify (thin read layer)
┌─────────────────────────────────────────┐        ┌───────────────────────┐
│ ingestion → adjustment → indicators →   │ writes │ Next.js App Router    │
│ sentiment scoring (FinBERT) → regime →  │──────▶ │ reads precomputed     │
│ signals → backtests                     │        │ Supabase tables       │
└─────────────────────────────────────────┘        └───────────────────────┘
                     ▼
             Supabase Postgres (RLS deny-by-default)
```

- **Free data sources only**, behind a provider abstraction
  ([src/lib/providers](src/lib/providers/types.ts)) — app code never calls a
  vendor directly. Priority, rate limits, and TTLs live in
  [src/config/providers.ts](src/config/providers.ts).
- Every stored datapoint carries `source`, `as_of`, and `ingested_at`.
- Look-ahead prevention everywhere: vintaged macro observations, point-in-time
  index membership, strict as-of selection in backtests.

## Repository layout

```
supabase/migrations/   SQL schema (see supabase/README.md to apply)
src/config/            markets universe, provider limits — no magic numbers in code
src/lib/providers/     provider interfaces + registry (implementations in Phase 1)
src/lib/utils/         shared pure functions (unit-tested)
src/lib/env.ts         zod-validated env access
.github/workflows/     CI + (later) scheduled ingestion/compute jobs
```

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local`, fill in Supabase + provider keys.
   **Secrets never go in code or commits** — only `.env.local`, GitHub Actions
   secrets, and Netlify env vars.
3. Apply `supabase/migrations/` to the Supabase project (see
   [supabase/README.md](supabase/README.md)).
4. `npm run dev`

## Commands

| Command             | Purpose           |
| ------------------- | ----------------- |
| `npm run dev`       | local dev server  |
| `npm run lint`      | ESLint            |
| `npm run typecheck` | `tsc --noEmit`    |
| `npm test`          | vitest unit tests |

## Build phases

- [x] **Phase 0** — scaffold: repo, schema, env handling, provider abstraction, CI
- [ ] **Phase 1** — ingestion: OHLCV, constituents, corporate actions, macro, calendar
- [ ] **Phase 2** — technical engine (Layer 2 indicators, reference-tested)
- [ ] **Phase 3** — narrative/sentiment engine (RSS, GDELT, Reddit, StockTwits, FinBERT)
- [ ] **Phase 3b** — regime engine (Layer 1)
- [ ] **Phase 4** — signal synthesis + regime gate + event overlay
- [ ] **Phase 5** — validation: backtesting, walk-forward, data-quality guards
- [ ] **Phase 6** — UI (7 screens)
- [ ] **Phase 7** — alerts & export
