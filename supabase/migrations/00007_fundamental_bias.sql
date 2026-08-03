/* Fundamental-expectation overlay (scaffold).
Adds an optional directional bias to economic_events so the Layer 3
signal engine can treat an agreeing catalyst as fundamental SUPPORT for
a breakout, rather than only ever suppressing signals around it (the
existing event-blackout behaviour). Null = unknown/neutral, which
preserves today's blackout-only behaviour exactly until a future
ingestion job populates this column (e.g. from dividend declarations,
consensus-EPS-vs-prior comparisons, or split/bonus-issue chatter).
Additive and backward-compatible: no existing rows are touched, and the
column defaults to null everywhere. */

alter table economic_events
add column expected_bias text check (expected_bias in ('bullish', 'bearish'));

comment on column economic_events.expected_bias is
'Optional directional read (bullish/bearish) on this event, populated by a future fundamentals-ingestion job. Null means unknown/neutral and falls back to blackout-only behaviour in the signal engine.';

