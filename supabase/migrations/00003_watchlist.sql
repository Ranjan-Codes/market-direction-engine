-- User watchlist (single-user v1; extensible to per-user later by adding a
-- user_id column). RLS enabled like everything else — server-side access only.
create table watchlist_items (
  id            bigint generated always as identity primary key,
  instrument_id bigint not null references instruments (id) unique,
  added_at      timestamptz not null default now(),
  notes         text
);
alter table watchlist_items enable row level security;
