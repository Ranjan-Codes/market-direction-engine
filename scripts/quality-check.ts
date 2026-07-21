import { loadEnvLocal } from "../src/lib/load-env";
import { closePool, getPool } from "../src/lib/db";
import { withIngestionRun } from "../src/lib/ingest/log";
import { CONSTITUENT_DAILY_RETENTION_DAYS } from "../src/config/markets";

/**
 * Data-quality guards (guardrail: never fabricate or silently backfill —
 * surface gaps). Checks:
 *   1. Index staleness — every index must have a bar within 4 calendar days.
 *   2. Constituent coverage — % of open members with a bar in the last 5
 *      business days; < 95% is a failure.
 *   3. Impossible prices — negative/zero closes, high < low.
 *   4. Daily-bar gaps on indices over the last 30 days.
 * Also prunes constituent daily bars past the retention window.
 * Exit code 1 on any failure so the Actions run goes red.
 */
loadEnvLocal();

interface Problem {
  severity: "error" | "warn";
  check: string;
  detail: string;
}

async function main(): Promise<void> {
  await withIngestionRun("quality-check", null, async () => {
    const pool = getPool();
    const problems: Problem[] = [];

    // 1. Index staleness
    const { rows: staleness } = await pool.query(`
      select i.symbol, max(o.trade_date)::text as last_bar,
             current_date - max(o.trade_date) as days_behind
        from instruments i
        left join ohlcv_daily o on o.instrument_id = i.id
       where i.instrument_type = 'index' and i.is_active
       group by i.symbol`);
    for (const r of staleness) {
      if (r.last_bar == null) {
        problems.push({ severity: "error", check: "staleness", detail: `${r.symbol}: no bars at all` });
      } else if (Number(r.days_behind) > 4) {
        problems.push({
          severity: "error", check: "staleness",
          detail: `${r.symbol}: last bar ${r.last_bar} (${r.days_behind} days behind)`,
        });
      }
    }

    // 2. Constituent coverage per index
    const { rows: coverage } = await pool.query(`
      select idx.symbol as index_symbol,
             count(*) as members,
             count(*) filter (
               where exists (
                 select 1 from ohlcv_daily o
                  where o.instrument_id = m.constituent_id
                    and o.trade_date >= current_date - 7
               )
             ) as with_recent_bars
        from index_membership m
        join instruments idx on idx.id = m.index_id
       where m.valid_to is null
       group by idx.symbol`);
    for (const r of coverage) {
      const pct = (100 * Number(r.with_recent_bars)) / Number(r.members);
      if (pct < 95) {
        problems.push({
          severity: "error", check: "coverage",
          detail: `${r.index_symbol}: only ${pct.toFixed(1)}% of ${r.members} members have bars in the last 7 days`,
        });
      }
    }

    // 3a. Impossible high < low — repair deterministically (clamp to the
    // bar's own min/max) and log every repair; never silent (WTI's real
    // negative April-2020 close taught us futures prices CAN be negative,
    // but high < low is impossible in any market).
    const { rows: repaired } = await pool.query(`
      update ohlcv_daily set
        high = greatest(open, high, low, close),
        low  = least(open, high, low, close),
        adj_high = greatest(adj_open, adj_high, adj_low, adj_close),
        adj_low  = least(adj_open, adj_high, adj_low, adj_close)
      where high is not null and low is not null and high < low
      returning instrument_id, trade_date::text`);
    const { rows: repairedW } = await pool.query(`
      update ohlcv_weekly set
        high = greatest(open, high, low, close),
        low  = least(open, high, low, close),
        adj_high = greatest(adj_open, adj_high, adj_low, adj_close),
        adj_low  = least(adj_open, adj_high, adj_low, adj_close)
      where high is not null and low is not null and high < low
      returning instrument_id, week_end::text`);
    if (repaired.length + repairedW.length > 0) {
      problems.push({
        severity: "warn", check: "prices",
        detail: `repaired ${repaired.length} daily + ${repairedW.length} weekly impossible high<low bars (clamped to bar min/max): ${JSON.stringify([...repaired, ...repairedW])}`,
      });
    }

    // 3b. Non-positive closes are an error for cash instruments only —
    // futures can legitimately settle negative (WTI 2020-04-20).
    const { rows: badPrices } = await pool.query(`
      select count(*) as n from ohlcv_daily d
        join instruments i on i.id = d.instrument_id
       where d.close <= 0 and i.instrument_type in ('equity','etf','index')`);
    if (Number(badPrices[0].n) > 0) {
      problems.push({
        severity: "error", check: "prices",
        detail: `${badPrices[0].n} equity/etf/index daily bars with non-positive close`,
      });
    }

    // 4. Gaps in index dailies (missing weekdays, last 30 days; holidays ⇒ warn only)
    const { rows: gaps } = await pool.query(`
      with days as (
        select d::date as day from generate_series(current_date - 30, current_date - 1, '1 day') d
        where extract(isodow from d) < 6
      )
      select i.symbol, count(*) as missing
        from instruments i cross join days
       where i.instrument_type = 'index' and i.is_active
         and not exists (
           select 1 from ohlcv_daily o
            where o.instrument_id = i.id and o.trade_date = days.day)
       group by i.symbol having count(*) > 3`);
    for (const r of gaps) {
      problems.push({
        severity: "warn", check: "gaps",
        detail: `${r.symbol}: ${r.missing} weekday bars missing in last 30 days (holidays expected; investigate if >3)`,
      });
    }

    // Retention prune (equities only)
    const { rowCount: pruned } = await pool.query(
      `delete from ohlcv_daily o using instruments i
        where i.id = o.instrument_id and i.instrument_type = 'equity'
          and o.trade_date < current_date - $1::int`,
      [CONSTITUENT_DAILY_RETENTION_DAYS],
    );

    for (const p of problems) {
      console[p.severity === "error" ? "error" : "warn"](`  [${p.severity}] ${p.check}: ${p.detail}`);
    }
    console.log(`  pruned ${pruned} daily bars past retention; ${problems.length} problems`);

    if (problems.some((p) => p.severity === "error")) {
      throw new Error(
        `quality-check failed: ${problems.filter((p) => p.severity === "error").length} error(s)`,
      );
    }
    return { rowsWritten: pruned ?? 0, detail: { problems } };
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
