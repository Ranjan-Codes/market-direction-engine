# Database migrations

SQL migrations for the Supabase Postgres project, applied in filename order.

## Applying

Either:

1. **Supabase CLI** (preferred once linked):
   ```
   supabase link --project-ref <ref>
   supabase db push
   ```
2. **SQL editor**: paste each migration into the Supabase dashboard SQL editor
   and run, in order.

## Conventions

- Every stored datapoint carries `as_of` (vendor effective time) and
  `ingested_at` (write time).
- `macro_observations` is **vintaged** — revisions add new rows with a later
  `as_of` rather than overwriting; backtests select the vintage available at
  the simulated date to prevent look-ahead.
- RLS is enabled on all tables with no policies: deny-by-default. Server-side
  code (GitHub Actions, Next.js API routes) uses the service-role key.
