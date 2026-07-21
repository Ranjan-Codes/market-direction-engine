-- Threshold alerts: one row per fired alert. `fingerprint` dedupes — an
-- alert re-fires only when its content changes (not every day it stays true).
create table alerts (
  id          bigint generated always as identity primary key,
  alert_type  text not null,          -- gauge | regime_change | breadth_divergence | watchlist_verdict
  subject     text not null,          -- e.g. SPX, AAPL
  message     text not null,
  fingerprint text not null,          -- dedupe key: same fingerprint = don't re-alert
  delivered   boolean not null default false,  -- GitHub issue created
  created_at  timestamptz not null default now()
);
create index idx_alerts_subject on alerts (alert_type, subject, created_at desc);
alter table alerts enable row level security;
